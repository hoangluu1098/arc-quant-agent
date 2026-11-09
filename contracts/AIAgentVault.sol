// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPriceFeed} from "./AgentPriceFeed.sol";

/// @title AIAgentVault
/// @notice Collateralized, capped-PnL BTC/USD demo positions against an owner-funded pool.
/// @dev Intended for Arc Testnet USDC at 0x3600000000000000000000000000000000000000
///      (6 decimals). Supply that IERC20 to the constructor; amounts are USDC base units.
///      The agent-published demo feed is trusted, NOT an independent production oracle.
///      Prices and brackets have 8 decimals. No actual BTC or external leveraged trade is bought.
///      The immutable IPriceFeed may instead point to an adapter when deploying a new vault.
///      Solvency: token balance >= free user balances + totalMargin + poolLiquidity.
/// @notice WARNING: The price publisher is a trusted centralized authority that could manipulate
///         settlement prices and drain the counterparty pool. Testnet with disposable funds ONLY.
/// @dev Before any real-value use, replace the agent-fed feed with a Pyth/Chainlink adapter;
///      the vault only depends on IPriceFeed. Synchronous execution against the last published
///      price allows latency arbitrage, only partially mitigated by the trade fee and short
///      staleness window.
contract AIAgentVault is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    uint256 public constant PRICE_DECIMALS = 1e8;
    uint256 public constant MAX_LEVERAGE = 5;
    uint256 public constant MIN_MARGIN = 1e6;
    uint256 public constant MAX_RATIONALE_BYTES = 280;
    uint256 public constant EMERGENCY_DELAY = 1 days;

    IERC20 public immutable usdc;
    IPriceFeed public immutable feed;
    address public agent;
    uint256 public maxStaleness = 60 seconds;
    uint16 public tradeFeeBps = 10;

    struct Settings {
        bool agentEnabled;
        uint8 maxLeverage;
        uint128 maxMarginPerTrade;
    }

    struct Position {
        bool open;
        bool isLong;
        uint8 leverage;
        uint128 margin;
        uint128 entryPrice;
        uint128 stopLoss;
        uint128 takeProfit;
        uint40 openedAt;
    }

    enum CloseReason { Manual, Agent, StopLoss, TakeProfit, Liquidation, Emergency }

    mapping(address => uint256) public balance;
    mapping(address => Settings) public settings;
    mapping(address => Position) public position;
    address[] public users;
    mapping(address => bool) public isUser;
    uint256 public poolLiquidity;
    uint256 public poolReserved;
    uint256 public totalMargin;

    error ZeroAddress();
    error ZeroAmount();
    error OnlyAgent();
    error UnauthorizedClose();
    error InvalidLeverage();
    error AgentDisabled();
    error AgentLimitExceeded();
    error PositionAlreadyOpen();
    error NoOpenPosition();
    error InvalidMargin();
    error InsufficientBalance();
    error InsufficientPoolLiquidity();
    error InvalidPrice();
    error StalePrice();
    error InvalidBrackets();
    error RationaleTooLong();
    error NotTriggerable();
    error EmergencyUnavailable();
    error InvalidStaleness();
    error UnsupportedTokenTransfer();
    error UnexpectedEther();
    error RenounceDisabled();
    error AgentCannotTrade();
    error InvalidTradeFee();

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event SettingsUpdated(address indexed user, bool agentEnabled, uint8 maxLeverage, uint128 maxMarginPerTrade);
    event PositionOpened(
        address indexed user, bool byAgent, bool isLong, uint256 margin, uint8 leverage,
        uint256 entryPrice, uint256 stopLoss, uint256 takeProfit, string rationale
    );
    event PositionClosed(
        address indexed user, address indexed closedBy, uint256 exitPrice,
        int256 pnl, uint256 payout, CloseReason reason, string rationale
    );
    event PoolFunded(address indexed funder, uint256 amount);
    event PoolWithdrawn(address indexed recipient, uint256 amount);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event MaxStalenessUpdated(uint256 oldValue, uint256 newValue);
    event TradeFeeUpdated(uint16 oldValue, uint16 newValue);

    /// @notice Configure the six-decimal collateral token, replaceable oracle interface and authorities.
    constructor(IERC20 usdc_, IPriceFeed feed_, address owner_, address agent_) Ownable(owner_) {
        if (address(usdc_) == address(0) || address(feed_) == address(0) || agent_ == address(0)) {
            revert ZeroAddress();
        }
        usdc = usdc_;
        feed = feed_;
        agent = agent_;
        emit AgentUpdated(address(0), agent_);
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert OnlyAgent();
        _;
    }

    /// @notice Deposit collateral after approving this vault; first deposit registers the caller.
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (msg.sender == agent) revert AgentCannotTrade();
        _pull(amount);
        balance[msg.sender] += amount;
        if (!isUser[msg.sender]) {
            isUser[msg.sender] = true;
            users.push(msg.sender);
        }
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw only your free collateral, including while paused.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > balance[msg.sender]) revert InsufficientBalance();
        balance[msg.sender] -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Set limits on future agent openings; disabling never prevents a risk-reducing close.
    function setSettings(bool agentEnabled, uint8 maxLeverage, uint128 maxMarginPerTrade) external {
        _checkLeverage(maxLeverage);
        settings[msg.sender] = Settings(agentEnabled, maxLeverage, maxMarginPerTrade);
        emit SettingsUpdated(msg.sender, agentEnabled, maxLeverage, maxMarginPerTrade);
    }

    /// @notice Open your own position; agent-specific opt-in and limits do not apply.
    function openPosition(
        bool isLong, uint256 margin, uint8 leverage, uint256 stopLoss,
        uint256 takeProfit, string calldata rationale
    ) external nonReentrant whenNotPaused {
        if (msg.sender == agent) revert AgentCannotTrade();
        Position memory p;
        p.isLong = isLong;
        p.margin = margin.toUint128();
        p.leverage = leverage;
        p.stopLoss = stopLoss.toUint128();
        p.takeProfit = takeProfit.toUint128();
        _open(msg.sender, p, rationale, false);
    }

    /// @notice Open within the depositor's opt-in and per-trade limits.
    function agentOpenPosition(
        address user, bool isLong, uint256 margin, uint8 leverage,
        uint256 stopLoss, uint256 takeProfit, string calldata rationale
    ) external onlyAgent nonReentrant whenNotPaused {
        Settings memory s = settings[user];
        if (!s.agentEnabled) revert AgentDisabled();
        if (margin > s.maxMarginPerTrade || leverage > s.maxLeverage) revert AgentLimitExceeded();
        Position memory p;
        p.isLong = isLong;
        p.margin = margin.toUint128();
        p.leverage = leverage;
        p.stopLoss = stopLoss.toUint128();
        p.takeProfit = takeProfit.toUint128();
        _open(user, p, rationale, true);
    }

    /// @notice User or current agent closes at the fresh current price, even while paused.
    function closePosition(address user, string calldata rationale) external nonReentrant {
        if (msg.sender != user && msg.sender != agent) revert UnauthorizedClose();
        _checkRationale(rationale);
        _settle(user, _freshPrice(), msg.sender == user ? CloseReason.Manual : CloseReason.Agent, rationale);
    }

    /// @notice Permissionless keeper settlement; liquidation takes precedence over bracket hits.
    function trigger(address user) external nonReentrant {
        Position memory p = position[user];
        if (!p.open) revert NoOpenPosition();
        uint256 price = _freshPrice();
        CloseReason reason;
        if (_pnl(p, price) == -uint256(p.margin).toInt256()) {
            reason = CloseReason.Liquidation;
        } else if (p.isLong ? price <= p.stopLoss : price >= p.stopLoss) {
            reason = CloseReason.StopLoss;
        } else if (p.isLong ? price >= p.takeProfit : price <= p.takeProfit) {
            reason = CloseReason.TakeProfit;
        } else {
            revert NotTriggerable();
        }
        _settle(user, price, reason, "");
    }

    /// @notice Anyone can return margin at zero PnL after more than one day without a feed update.
    /// @dev Requires a responding feed; a reverting oracle cannot supply its last-update timestamp.
    function emergencyClose(address user) external nonReentrant {
        Position memory p = position[user];
        if (!p.open) revert NoOpenPosition();
        (, uint256 updatedAt) = feed.getPrice();
        if (updatedAt > block.timestamp || block.timestamp - updatedAt <= EMERGENCY_DELAY) {
            revert EmergencyUnavailable();
        }
        _settle(user, p.entryPrice, CloseReason.Emergency, "");
    }

    /// @notice Contribute liquidity to the counterparty pool; contributions have no share/redemption claim.
    function fundPool(uint256 amount) external nonReentrant whenNotPaused {
        _pull(amount);
        poolLiquidity += amount;
        emit PoolFunded(msg.sender, amount);
    }

    /// @notice Owner may withdraw only pool liquidity not reserved for open positions.
    function withdrawPool(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > poolFree()) revert InsufficientPoolLiquidity();
        poolLiquidity -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit PoolWithdrawn(msg.sender, amount);
    }

    /// @notice Replace the hot agent wallet; existing depositor opt-ins remain in force.
    function setAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0)) revert ZeroAddress();
        emit AgentUpdated(agent, newAgent);
        agent = newAgent;
    }

    /// @notice Configure freshness tolerance from 30 seconds through one hour, inclusive.
    function setMaxStaleness(uint256 newValue) external onlyOwner {
        if (newValue < 30 seconds || newValue > 1 hours) revert InvalidStaleness();
        emit MaxStalenessUpdated(maxStaleness, newValue);
        maxStaleness = newValue;
    }

    /// @notice Set the round-trip fee, charged once at settlement on margin times leverage.
    /// @dev Applies the current fee to all non-emergency settlements, including existing positions.
    function setTradeFeeBps(uint16 newValue) external onlyOwner {
        if (newValue > 100) revert InvalidTradeFee();
        emit TradeFeeUpdated(tradeFeeBps, newValue);
        tradeFeeBps = newValue;
    }

    /// @notice Ownership renunciation is disabled; two-step ownership transfer remains available.
    function renounceOwnership() public pure override { revert RenounceDisabled(); }

    /// @notice Stop deposits, pool funding and new positions; all exit paths remain available.
    function pause() external onlyOwner { _pause(); }

    /// @notice Resume deposits, pool funding and new positions.
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Number of unique addresses that have deposited.
    function usersLength() external view returns (uint256) { return users.length; }

    /// @notice Read a bounded registry page; an offset beyond the end returns an empty array.
    function usersSlice(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        uint256 length = users.length;
        if (offset >= length) return new address[](0);
        uint256 count = Math.min(limit, length - offset);
        result = new address[](count);
        for (uint256 i; i < count; ++i) result[i] = users[offset + i];
    }

    /// @notice Retrieve free collateral, agent settings and the current position together.
    function accountOf(address user) external view returns (uint256, Settings memory, Position memory) {
        return (balance[user], settings[user], position[user]);
    }

    /// @notice Mark to the latest observation, reporting freshness rather than reverting on stale data.
    /// @dev PnL is zero without an open position or for an invalid zero price. Oracle reverts propagate.
    function unrealizedPnl(address user) external view returns (int256 pnl, uint256 price, bool fresh) {
        uint256 updatedAt;
        (price, updatedAt) = feed.getPrice();
        fresh = _isFresh(price, updatedAt);
        Position memory p = position[user];
        if (p.open && price != 0) pnl = _pnl(p, price);
    }

    /// @notice Pool liquidity available for new reservations or owner withdrawal.
    function poolFree() public view returns (uint256) { return poolLiquidity - poolReserved; }

    function _open(address user, Position memory p, string calldata rationale, bool byAgent) internal {
        _requireNotPaused();
        _checkRationale(rationale);
        if (position[user].open) revert PositionAlreadyOpen();
        if (p.margin < MIN_MARGIN) revert InvalidMargin();
        if (p.margin > balance[user]) revert InsufficientBalance();
        _checkLeverage(p.leverage);
        uint256 price = _freshPrice();
        if (p.stopLoss == 0 || p.takeProfit == 0) revert InvalidBrackets();
        if (p.isLong) {
            if (p.stopLoss >= price || p.takeProfit <= price) revert InvalidBrackets();
        } else {
            if (p.takeProfit >= price || p.stopLoss <= price) revert InvalidBrackets();
        }
        if (p.margin > poolFree()) revert InsufficientPoolLiquidity();
        p.open = true;
        p.entryPrice = price.toUint128();
        p.openedAt = block.timestamp.toUint40();
        poolReserved += p.margin;
        totalMargin += p.margin;
        balance[user] -= p.margin;
        position[user] = p;
        _emitOpened(user, p, byAgent, rationale);
    }

    function _emitOpened(address user, Position memory p, bool byAgent, string calldata rationale) private {
        emit PositionOpened(
            user, byAgent, p.isLong, p.margin, p.leverage, p.entryPrice, p.stopLoss, p.takeProfit, rationale
        );
    }

    /// @dev No token interaction: release reservations and move internal claims before emitting.
    function _settle(address user, uint256 exitPrice, CloseReason reason, string memory rationale) internal {
        Position memory p = position[user];
        if (!p.open) revert NoOpenPosition();
        uint256 margin = p.margin;
        int256 pnl;
        if (reason != CloseReason.Emergency) {
            int256 gross = _pnl(p, exitPrice);
            uint256 notional = margin * p.leverage;
            uint256 fee = notional * tradeFeeBps / 10_000;
            pnl = gross - fee.toInt256();
            if (pnl < -margin.toInt256()) pnl = -margin.toInt256();
        }
        poolReserved -= margin;
        totalMargin -= margin;
        uint256 payout;
        if (pnl > 0) {
            uint256 profit = pnl.toUint256();
            poolLiquidity -= profit;
            payout = margin + profit;
        } else {
            uint256 loss = (-pnl).toUint256();
            poolLiquidity += loss;
            payout = margin - loss;
        }
        balance[user] += payout;
        delete position[user];
        emit PositionClosed(user, msg.sender, exitPrice, pnl, payout, reason, rationale);
    }

    /// @dev Unsigned full-precision math avoids overflow for arbitrary uint256 oracle prices.
    ///      Rounds magnitude down, matching signed division toward zero; clips to +/-margin.
    function _pnl(Position memory p, uint256 exitPrice) internal pure returns (int256) {
        uint256 entry = p.entryPrice;
        uint256 difference = exitPrice >= entry ? exitPrice - entry : entry - exitPrice;
        bool profit = p.isLong ? exitPrice >= entry : exitPrice <= entry;
        uint256 magnitude;
        // Once difference * leverage >= entry the capped result is exactly margin.
        if (difference >= Math.ceilDiv(entry, p.leverage)) {
            magnitude = p.margin;
        } else {
            magnitude = Math.mulDiv(uint256(p.margin) * p.leverage, difference, entry);
        }
        int256 signedMagnitude = magnitude.toInt256();
        return profit ? signedMagnitude : -signedMagnitude;
    }

    function _freshPrice() internal view returns (uint256 price) {
        uint256 updatedAt;
        (price, updatedAt) = feed.getPrice();
        if (price == 0) revert InvalidPrice();
        if (!_isFresh(price, updatedAt)) revert StalePrice();
    }

    function _isFresh(uint256 price, uint256 updatedAt) internal view returns (bool) {
        return price != 0 && updatedAt <= block.timestamp && block.timestamp - updatedAt <= maxStaleness;
    }

    function _checkLeverage(uint8 leverage) internal pure {
        if (leverage == 0 || leverage > MAX_LEVERAGE) revert InvalidLeverage();
    }

    function _checkRationale(string calldata rationale) internal pure {
        if (bytes(rationale).length > MAX_RATIONALE_BYTES) revert RationaleTooLong();
    }

    /// @dev Reject fee-on-transfer inputs instead of crediting unbacked claims. USDC is assumed non-rebasing.
    function _pull(uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBalance = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = usdc.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) {
            revert UnsupportedTokenTransfer();
        }
    }

    /// @notice Reject ordinary native-token transfers; forced ETH cannot be prevented or swept.
    receive() external payable { revert UnexpectedEther(); }
}
