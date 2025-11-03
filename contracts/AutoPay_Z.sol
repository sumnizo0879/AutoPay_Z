pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AutoPaySystem is ZamaEthereumConfig {
    struct PaymentRule {
        string ruleId;
        euint32 encryptedThreshold;
        uint256 publicThreshold;
        address recipient;
        string description;
        address creator;
        uint256 timestamp;
        bool isActive;
    }

    struct Subscription {
        string subscriptionId;
        string ruleId;
        address subscriber;
        uint256 lastPaymentTimestamp;
        bool isActive;
    }

    mapping(string => PaymentRule) public paymentRules;
    mapping(string => Subscription) public subscriptions;
    mapping(string => string[]) public ruleSubscriptions;

    string[] public ruleIds;
    string[] public subscriptionIds;

    event PaymentRuleCreated(string indexed ruleId, address indexed creator);
    event SubscriptionCreated(string indexed subscriptionId, string indexed ruleId, address indexed subscriber);
    event PaymentExecuted(string indexed subscriptionId, string indexed ruleId, address indexed recipient);

    constructor() ZamaEthereumConfig() {
    }

    function createPaymentRule(
        string calldata ruleId,
        externalEuint32 encryptedThreshold,
        bytes calldata inputProof,
        uint256 publicThreshold,
        address recipient,
        string calldata description
    ) external {
        require(bytes(paymentRules[ruleId].ruleId).length == 0, "Rule already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedThreshold, inputProof)), "Invalid encrypted input");

        paymentRules[ruleId] = PaymentRule({
            ruleId: ruleId,
            encryptedThreshold: FHE.fromExternal(encryptedThreshold, inputProof),
            publicThreshold: publicThreshold,
            recipient: recipient,
            description: description,
            creator: msg.sender,
            timestamp: block.timestamp,
            isActive: true
        });

        FHE.allowThis(paymentRules[ruleId].encryptedThreshold);
        FHE.makePubliclyDecryptable(paymentRules[ruleId].encryptedThreshold);

        ruleIds.push(ruleId);
        emit PaymentRuleCreated(ruleId, msg.sender);
    }

    function createSubscription(
        string calldata subscriptionId,
        string calldata ruleId,
        address subscriber
    ) external {
        require(bytes(subscriptions[subscriptionId].subscriptionId).length == 0, "Subscription already exists");
        require(bytes(paymentRules[ruleId].ruleId).length > 0, "Rule does not exist");
        require(paymentRules[ruleId].isActive, "Rule is not active");

        subscriptions[subscriptionId] = Subscription({
            subscriptionId: subscriptionId,
            ruleId: ruleId,
            subscriber: subscriber,
            lastPaymentTimestamp: 0,
            isActive: true
        });

        ruleSubscriptions[ruleId].push(subscriptionId);
        subscriptionIds.push(subscriptionId);

        emit SubscriptionCreated(subscriptionId, ruleId, subscriber);
    }

    function executePayment(
        string calldata subscriptionId,
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(subscriptions[subscriptionId].subscriptionId).length > 0, "Subscription does not exist");
        require(subscriptions[subscriptionId].isActive, "Subscription is not active");

        PaymentRule storage rule = paymentRules[subscriptions[subscriptionId].ruleId];
        require(rule.isActive, "Rule is not active");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(rule.encryptedThreshold);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);

        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        require(decodedValue >= rule.publicThreshold, "Threshold not met");

        subscriptions[subscriptionId].lastPaymentTimestamp = block.timestamp;

        emit PaymentExecuted(subscriptionId, rule.ruleId, rule.recipient);
    }

    function getPaymentRule(string calldata ruleId) external view returns (
        string memory,
        uint256,
        address,
        string memory,
        address,
        uint256,
        bool
    ) {
        require(bytes(paymentRules[ruleId].ruleId).length > 0, "Rule does not exist");
        PaymentRule storage rule = paymentRules[ruleId];
        return (
            rule.ruleId,
            rule.publicThreshold,
            rule.recipient,
            rule.description,
            rule.creator,
            rule.timestamp,
            rule.isActive
        );
    }

    function getSubscription(string calldata subscriptionId) external view returns (
        string memory,
        string memory,
        address,
        uint256,
        bool
    ) {
        require(bytes(subscriptions[subscriptionId].subscriptionId).length > 0, "Subscription does not exist");
        Subscription storage sub = subscriptions[subscriptionId];
        return (
            sub.subscriptionId,
            sub.ruleId,
            sub.subscriber,
            sub.lastPaymentTimestamp,
            sub.isActive
        );
    }

    function getRuleSubscriptions(string calldata ruleId) external view returns (string[] memory) {
        require(bytes(paymentRules[ruleId].ruleId).length > 0, "Rule does not exist");
        return ruleSubscriptions[ruleId];
    }

    function getAllRuleIds() external view returns (string[] memory) {
        return ruleIds;
    }

    function getAllSubscriptionIds() external view returns (string[] memory) {
        return subscriptionIds;
    }

    function disableRule(string calldata ruleId) external {
        require(bytes(paymentRules[ruleId].ruleId).length > 0, "Rule does not exist");
        require(msg.sender == paymentRules[ruleId].creator, "Only creator can disable rule");
        paymentRules[ruleId].isActive = false;
    }

    function disableSubscription(string calldata subscriptionId) external {
        require(bytes(subscriptions[subscriptionId].subscriptionId).length > 0, "Subscription does not exist");
        require(msg.sender == subscriptions[subscriptionId].subscriber, "Only subscriber can disable subscription");
        subscriptions[subscriptionId].isActive = false;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

