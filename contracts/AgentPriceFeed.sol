// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Minimal replaceable BTC/USD oracle interface.
interface IPriceFeed {
    /// @return price USD per BTC, scaled by 1e8.
    /// @return updatedAt Unix timestamp of the observation.
    function getPrice() external view returns (uint256 price, uint256 updatedAt);
}

/// @title AgentPriceFeed
/// @notice Centralized, agent-published BTC/USD feed for an Arc Testnet demo ONLY.
/// @dev Not an independent market oracle: the publisher and owner can manipulate prices.
///      Consumers may later replace this implementation with a Pyth-backed IPriceFeed adapter.
/// @notice WARNING: The price publisher is a trusted centralized authority that could manipulate
///         settlement prices and drain the counterparty pool. Testnet with disposable funds ONLY.
/// @dev Before any real-value use, this feed must be replaced by a Pyth/Chainlink adapter;
///      the vault only depends on IPriceFeed. Synchronous execution against the last published
///      price allows latency arbitrage, only partially mitigated by the vault's trade fee and
///      short staleness window.
contract AgentPriceFeed is Ownable2Step, IPriceFeed {
    address public publisher;
    uint256 public price;
    uint256 public updatedAt;
    uint256 public maxDeviationBps = 500;

    error ZeroAddress();
    error ZeroPrice();
    error OnlyPublisher();
    error ExcessiveDeviation();
    error InvalidDeviation();
    error UnexpectedEther();
    error RenounceDisabled();

    event PriceUpdated(uint256 price, uint256 updatedAt);
    event PriceReset(uint256 price, uint256 updatedAt);
    event PublisherUpdated(address indexed oldPublisher, address indexed newPublisher);
    event MaxDeviationBpsUpdated(uint256 oldValue, uint256 newValue);

    /// @notice Initialize ownership, publisher and a nonzero 8-decimal BTC/USD price.
    constructor(address owner_, address publisher_, uint256 initialPrice_) Ownable(owner_) {
        if (publisher_ == address(0)) revert ZeroAddress();
        if (initialPrice_ == 0) revert ZeroPrice();
        publisher = publisher_;
        price = initialPrice_;
        updatedAt = block.timestamp;
        emit PriceUpdated(initialPrice_, updatedAt);
    }

    modifier onlyPublisher() {
        if (msg.sender != publisher) revert OnlyPublisher();
        _;
    }

    /// @notice Publish a price within the configured per-update deviation limit.
    /// @dev This limit does not prevent cumulative manipulation through repeated updates.
    function publish(uint256 newPrice) external onlyPublisher {
        if (newPrice == 0) revert ZeroPrice();
        uint256 oldPrice = price;
        uint256 difference = newPrice > oldPrice ? newPrice - oldPrice : oldPrice - newPrice;
        // Equivalent to difference * 10000 > oldPrice * bps, without overflow.
        if (difference > Math.mulDiv(oldPrice, maxDeviationBps, 10_000)) revert ExcessiveDeviation();
        price = newPrice;
        updatedAt = block.timestamp;
        emit PriceUpdated(newPrice, updatedAt);
    }

    /// @notice Owner re-anchors the demo feed without a deviation restriction.
    function resetPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert ZeroPrice();
        price = newPrice;
        updatedAt = block.timestamp;
        emit PriceReset(newPrice, updatedAt);
    }

    /// @notice Replace the authorized publisher.
    function setPublisher(address newPublisher) external onlyOwner {
        if (newPublisher == address(0)) revert ZeroAddress();
        emit PublisherUpdated(publisher, newPublisher);
        publisher = newPublisher;
    }

    /// @notice Set the maximum change per publication, from 1 to 2000 basis points.
    function setMaxDeviationBps(uint256 newValue) external onlyOwner {
        if (newValue == 0 || newValue > 2000) revert InvalidDeviation();
        emit MaxDeviationBpsUpdated(maxDeviationBps, newValue);
        maxDeviationBps = newValue;
    }

    /// @notice Ownership renunciation is disabled; two-step ownership transfer remains available.
    function renounceOwnership() public pure override { revert RenounceDisabled(); }

    /// @inheritdoc IPriceFeed
    function getPrice() external view override returns (uint256, uint256) {
        return (price, updatedAt);
    }

    /// @notice Reject ordinary native-token transfers; forced ETH cannot be prevented.
    receive() external payable { revert UnexpectedEther(); }
}
