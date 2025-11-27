# FHE-based Habitual Payment

Project FHE-based Habitual Payment is a privacy-preserving payment automation solution powered by Zama's Fully Homomorphic Encryption (FHE) technology. This application enables the secure management of recurring transactions and subscription payments without exposing sensitive financial data, ensuring user privacy and compliance with privacy regulations.

## The Problem

In today's digital economy, individuals increasingly rely on automated payment systems to manage subscriptions and recurring transactions. However, these systems often operate on cleartext data, exposing sensitive information such as payment amounts and transaction frequencies to potential breaches. Such exposure can lead to unauthorized access, misuse of personal financial information, and heightened risk of fraud. As consumers seek more privacy and security, the need for a solution that protects their financial habits while allowing seamless automated transactions becomes crucial.

## The Zama FHE Solution

Fully Homomorphic Encryption offers a transformative solution to the privacy and security gaps in automated payment systems. By enabling computations on encrypted data, Zama's technologies allow sensitive payment information to remain confidential throughout the entire transaction process. 

Using fhevm to process encrypted inputs, our project ensures that payment conditions and triggers are encrypted, while still enabling the logic to execute without revealing the actual financial figures. This guarantees that all operations, including checks against subscription criteria and the execution of payments, are conducted in a secure environment, effectively mitigating the risk of data exposure.

## Key Features

- 🔒 **Encrypted Payment Conditions**: All payment criteria are encrypted, ensuring sensitive information is never disclosed during the payment process.
- 🧠 **Smart Trigger Logic**: Homomorphic triggers are utilized to execute payments based on predefined conditions without revealing the actual transaction data.
- 💳 **Subscription Management**: A seamless experience for managing recurring payments while maintaining user privacy.
- 📊 **Financial Insights**: Users can receive encrypted summaries of their payment habits, enabling informed financial management without compromising data security.
- ⚙️ **User-friendly Setup**: Quick configuration steps for users to set up their automated payments securely.

## Technical Architecture & Stack

The architecture for FHE-based Habitual Payment leverages the following technologies:

- **Core Privacy Engine**: Zama's Fully Homomorphic Encryption libraries (fhevm)
- **Smart Contract Layer**: Solidity for on-chain payment logic
- **Backend Services**: Node.js to handle user requests and business logic
- **Database**: A secure database solution for storing encrypted user data

## Smart Contract / Core Logic

Below is a simplified example of a Solidity contract that demonstrates how encrypted payment conditions are handled:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "TFHE.sol"; // Importing the TFHE library for operations on encrypted data

contract AutoPay {
    mapping(address => uint256) private userPayments;

    // Function to set a user's encrypted payment condition
    function setPaymentCondition(address user, uint64 encryptedCondition) public {
        userPayments[user] = encryptedCondition;
    }

    // Function to process payments based on encrypted conditions
    function processPayment(address user) public {
        uint256 paymentCondition = TFHE.decrypt(userPayments[user]);
        // Additional logic to execute payment if condition is met
    }
}
```

## Directory Structure

The directory structure for the FHE-based Habitual Payment project is organized as follows:

```
FHE-based-Habitual-Payment/
├── contracts/
│   └── AutoPay.sol
├── src/
│   ├── main.js
│   └── paymentLogic.js
├── scripts/
│   └── runPayment.js
├── tests/
│   └── paymentTests.js
├── .env
└── README.md
```

## Installation & Setup

### Prerequisites

To get started with FHE-based Habitual Payment, ensure you have the following installed:

- Node.js and npm
- A Solidity-compatible environment (like Hardhat)
- Python (if using any additional backend services)

### Dependency Installation

Run the following commands to install the necessary dependencies:

```bash
npm install fhevm
npm install hardhat
```

For any Python dependencies, you can install them using pip:

```bash
pip install concrete-ml
```

## Build & Run

To build and run the project, execute the following commands based on your environment:

1. **Compile the Smart Contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Start the Backend Service**:
   ```bash
   node src/main.js
   ```

3. **Execute Payment Logic**:
   ```bash
   node scripts/runPayment.js
   ```

## Acknowledgements

This project utilizes Zama's open-source FHE primitives, which are instrumental in enabling secure and private transactions. We are grateful for their contributions to the field of Fully Homomorphic Encryption, allowing developers to build innovative and privacy-first applications that meet modern demands.
