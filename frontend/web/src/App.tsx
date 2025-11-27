import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface AutoPayment {
  id: string;
  name: string;
  amount: number;
  condition: string;
  frequency: string;
  timestamp: number;
  creator: string;
  isVerified: boolean;
  decryptedValue?: number;
  encryptedValueHandle?: string;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<AutoPayment[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newPaymentData, setNewPaymentData] = useState({ 
    name: "", 
    amount: "", 
    condition: "monthly", 
    frequency: "30" 
  });
  const [selectedPayment, setSelectedPayment] = useState<AutoPayment | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const paymentsList: AutoPayment[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          paymentsList.push({
            id: businessId,
            name: businessData.name,
            amount: Number(businessData.publicValue1) || 0,
            condition: businessData.description,
            frequency: "30",
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setPayments(paymentsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createPayment = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingPayment(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating auto payment with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const amountValue = parseInt(newPaymentData.amount) || 0;
      const businessId = `payment-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, amountValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newPaymentData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        amountValue,
        parseInt(newPaymentData.frequency) || 30,
        newPaymentData.condition
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Auto payment created!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewPaymentData({ name: "", amount: "", condition: "monthly", frequency: "30" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingPayment(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const result = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Contract call failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredPayments = payments.filter(payment =>
    payment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    payment.condition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    totalPayments: payments.length,
    verifiedPayments: payments.filter(p => p.isVerified).length,
    totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
    activePayments: payments.filter(p => p.timestamp > Date.now()/1000 - 2592000).length
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>FHE AutoPay 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">💳</div>
            <h2>Connect Wallet to Start</h2>
            <p>Connect your wallet to access encrypted auto-payment system</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading payment system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FHE AutoPay 💳</h1>
          <p>Encrypted Automatic Payments</p>
        </div>
        
        <div className="header-actions">
          <button onClick={callIsAvailable} className="test-btn">
            Test Contract
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + New AutoPay
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="controls-bar">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search payments..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="control-buttons">
            <button onClick={() => setShowStats(!showStats)} className="stats-btn">
              {showStats ? "Hide Stats" : "Show Stats"}
            </button>
            <button onClick={loadData} disabled={isRefreshing} className="refresh-btn">
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {showStats && (
          <div className="stats-panel">
            <div className="stat-item">
              <span>Total Payments</span>
              <strong>{stats.totalPayments}</strong>
            </div>
            <div className="stat-item">
              <span>Verified</span>
              <strong>{stats.verifiedPayments}</strong>
            </div>
            <div className="stat-item">
              <span>Total Amount</span>
              <strong>${stats.totalAmount}</strong>
            </div>
            <div className="stat-item">
              <span>Active</span>
              <strong>{stats.activePayments}</strong>
            </div>
          </div>
        )}

        <div className="payments-grid">
          {filteredPayments.length === 0 ? (
            <div className="no-payments">
              <p>No auto payments found</p>
              <button onClick={() => setShowCreateModal(true)} className="create-btn">
                Create First Payment
              </button>
            </div>
          ) : (
            filteredPayments.map((payment, index) => (
              <div 
                className={`payment-card ${payment.isVerified ? "verified" : ""}`}
                key={index}
                onClick={() => setSelectedPayment(payment)}
              >
                <div className="payment-header">
                  <h3>{payment.name}</h3>
                  <span className={`status ${payment.isVerified ? "verified" : "pending"}`}>
                    {payment.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                  </span>
                </div>
                <div className="payment-details">
                  <div className="detail">
                    <span>Amount:</span>
                    <strong>${payment.amount}</strong>
                  </div>
                  <div className="detail">
                    <span>Condition:</span>
                    <span>{payment.condition}</span>
                  </div>
                  <div className="detail">
                    <span>Created:</span>
                    <span>{new Date(payment.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="payment-actions">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      decryptData(payment.id).then(amount => {
                        if (amount !== null) setDecryptedAmount(amount);
                      });
                    }}
                    disabled={isDecrypting}
                    className="decrypt-btn"
                  >
                    {isDecrypting ? "Decrypting..." : "Decrypt"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="faq-section">
          <h3>How FHE AutoPay Works</h3>
          <div className="faq-grid">
            <div className="faq-item">
              <h4>🔐 Encryption</h4>
              <p>Payment amounts are encrypted using FHE before being stored on-chain</p>
            </div>
            <div className="faq-item">
              <h4>⚡ Auto-Trigger</h4>
              <p>Payments automatically trigger when conditions are met without revealing amounts</p>
            </div>
            <div className="faq-item">
              <h4>🔍 Verification</h4>
              <p>Decrypt and verify payment data with zero-knowledge proofs</p>
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>New Auto Payment</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Payment Name</label>
                <input 
                  type="text" 
                  value={newPaymentData.name}
                  onChange={(e) => setNewPaymentData({...newPaymentData, name: e.target.value})}
                  placeholder="Netflix Subscription"
                />
              </div>
              
              <div className="form-group">
                <label>Amount (FHE Encrypted)</label>
                <input 
                  type="number" 
                  value={newPaymentData.amount}
                  onChange={(e) => setNewPaymentData({...newPaymentData, amount: e.target.value})}
                  placeholder="100"
                />
                <small>Encrypted with Zama FHE</small>
              </div>
              
              <div className="form-group">
                <label>Condition</label>
                <select 
                  value={newPaymentData.condition}
                  onChange={(e) => setNewPaymentData({...newPaymentData, condition: e.target.value})}
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createPayment} 
                disabled={creatingPayment || isEncrypting}
                className="submit-btn"
              >
                {creatingPayment || isEncrypting ? "Creating..." : "Create Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedPayment && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h2>Payment Details</h2>
              <button onClick={() => setSelectedPayment(null)} className="close-btn">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <span>Name:</span>
                  <strong>{selectedPayment.name}</strong>
                </div>
                <div className="detail-item">
                  <span>Amount:</span>
                  <strong>${selectedPayment.amount}</strong>
                </div>
                <div className="detail-item">
                  <span>Condition:</span>
                  <span>{selectedPayment.condition}</span>
                </div>
                <div className="detail-item">
                  <span>Status:</span>
                  <span className={`status ${selectedPayment.isVerified ? "verified" : "encrypted"}`}>
                    {selectedPayment.isVerified ? "On-chain Verified" : "FHE Encrypted"}
                  </span>
                </div>
              </div>
              
              <div className="verification-section">
                <h4>FHE Verification</h4>
                <button 
                  onClick={() => decryptData(selectedPayment.id)}
                  disabled={isDecrypting}
                  className="verify-btn"
                >
                  {isDecrypting ? "Verifying..." : "Verify on-chain"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            {transactionStatus.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;