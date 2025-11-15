import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface PaymentCondition {
  id: string;
  name: string;
  amount: number;
  frequency: number;
  threshold: number;
  description: string;
  timestamp: number;
  creator: string;
  isVerified: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentCondition[]>([]);
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
    frequency: "7", 
    threshold: "1",
    description: "" 
  });
  const [selectedPayment, setSelectedPayment] = useState<PaymentCondition | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterVerified, setFilterVerified] = useState(false);
  const [stats, setStats] = useState({ total: 0, verified: 0, active: 0 });

  const { initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevm = async () => {
      if (isConnected && !isInitialized) {
        try {
          await initialize();
        } catch (error) {
          console.error('FHEVM init failed:', error);
        }
      }
    };
    initFhevm();
  }, [isConnected, isInitialized, initialize]);

  useEffect(() => {
    const loadData = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      try {
        const contract = await getContractReadOnly();
        if (!contract) return;
        
        const businessIds = await contract.getAllBusinessIds();
        const paymentsList: PaymentCondition[] = [];
        
        for (const businessId of businessIds) {
          try {
            const businessData = await contract.getBusinessData(businessId);
            paymentsList.push({
              id: businessId,
              name: businessData.name,
              amount: Number(businessData.publicValue1) || 0,
              frequency: Number(businessData.publicValue2) || 0,
              threshold: Number(businessData.decryptedValue) || 0,
              description: businessData.description,
              timestamp: Number(businessData.timestamp),
              creator: businessData.creator,
              isVerified: businessData.isVerified,
              decryptedValue: Number(businessData.decryptedValue) || 0
            });
          } catch (e) {
            console.error('Error loading payment data:', e);
          }
        }
        
        setPayments(paymentsList);
        updateStats(paymentsList);
      } catch (e) {
        console.error('Load data error:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isConnected]);

  const updateStats = (paymentsList: PaymentCondition[]) => {
    setStats({
      total: paymentsList.length,
      verified: paymentsList.filter(p => p.isVerified).length,
      active: paymentsList.filter(p => p.timestamp > Date.now()/1000 - 2592000).length
    });
  };

  const createPayment = async () => {
    if (!isConnected || !address) { 
      showTransactionStatus("error", "Please connect wallet first");
      return; 
    }
    
    setCreatingPayment(true);
    showTransactionStatus("pending", "Creating encrypted payment condition...");
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Contract not available");
      
      const amountValue = parseInt(newPaymentData.amount) || 0;
      const businessId = `payment-${Date.now()}`;
      
      const encryptedResult = await encrypt(await contract.getAddress(), address, amountValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newPaymentData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newPaymentData.frequency) || 0,
        parseInt(newPaymentData.threshold) || 0,
        newPaymentData.description
      );
      
      showTransactionStatus("pending", "Waiting for confirmation...");
      await tx.wait();
      
      showTransactionStatus("success", "Payment condition created!");
      setTimeout(() => setTransactionStatus({ ...transactionStatus, visible: false }), 2000);
      
      setShowCreateModal(false);
      setNewPaymentData({ name: "", amount: "", frequency: "7", threshold: "1", description: "" });
      
      window.location.reload();
    } catch (e: any) {
      const errorMsg = e.message?.includes("rejected") ? "Transaction rejected" : "Creation failed";
      showTransactionStatus("error", errorMsg);
    } finally { 
      setCreatingPayment(false); 
    }
  };

  const decryptPayment = async (paymentId: string) => {
    if (!isConnected || !address) { 
      showTransactionStatus("error", "Please connect wallet first");
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      const contractWrite = await getContractWithSigner();
      if (!contractRead || !contractWrite) return null;
      
      const paymentData = await contractRead.getBusinessData(paymentId);
      if (paymentData.isVerified) {
        showTransactionStatus("success", "Data already verified");
        return Number(paymentData.decryptedValue);
      }
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(paymentId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        await contractRead.getAddress(),
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(paymentId, abiEncodedClearValues, decryptionProof)
      );
      
      showTransactionStatus("pending", "Verifying decryption...");
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      showTransactionStatus("success", "Data verified successfully!");
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("already verified")) {
        showTransactionStatus("success", "Data already verified");
        return null;
      }
      showTransactionStatus("error", "Decryption failed");
      return null; 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (contract) {
        const available = await contract.isAvailable();
        if (available) {
          showTransactionStatus("success", "Contract is available");
        }
      }
    } catch (e) {
      console.error('Availability check failed:', e);
    }
  };

  const showTransactionStatus = (status: "pending" | "success" | "error", message: string) => {
    setTransactionStatus({ visible: true, status, message });
    setTimeout(() => setTransactionStatus({ ...transactionStatus, visible: false }), 3000);
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = payment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = !filterVerified || payment.isVerified;
    return matchesSearch && matchesFilter;
  });

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo-section">
            <div className="logo-icon">🔐</div>
            <h1>FHE AutoPay</h1>
          </div>
          <ConnectButton />
        </header>
        
        <div className="connection-prompt">
          <div className="prompt-content">
            <div className="prompt-icon">💳</div>
            <h2>Private Automated Payments</h2>
            <p>Connect your wallet to setup encrypted payment conditions with fully homomorphic encryption</p>
            <div className="feature-grid">
              <div className="feature-item">
                <span className="feature-icon">🔒</span>
                <h4>Encrypted Conditions</h4>
                <p>Payment thresholds encrypted with Zama FHE</p>
              </div>
              <div className="feature-item">
                <span className="feature-icon">⚡</span>
                <h4>Auto-Trigger</h4>
                <p>Payments execute automatically when conditions met</p>
              </div>
              <div className="feature-item">
                <span className="feature-icon">👁️</span>
                <h4>Privacy First</h4>
                <p>Your spending patterns remain private</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="loading-screen">
        <div className="encryption-animation"></div>
        <p>Initializing FHE Encryption System...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <div className="logo-section">
            <div className="logo-icon">🔐</div>
            <h1>FHE AutoPay</h1>
          </div>
          <nav className="main-nav">
            <button className="nav-item active">Dashboard</button>
            <button className="nav-item">Payments</button>
            <button className="nav-item">Analytics</button>
          </nav>
        </div>
        
        <div className="header-right">
          <button onClick={checkAvailability} className="status-btn">Check Status</button>
          <ConnectButton />
        </div>
      </header>

      <main className="main-content">
        <section className="stats-section">
          <div className="stat-card">
            <div className="stat-icon">💳</div>
            <div className="stat-info">
              <h3>{stats.total}</h3>
              <p>Total Payments</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-info">
              <h3>{stats.verified}</h3>
              <p>Verified</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-info">
              <h3>{stats.active}</h3>
              <p>Active</p>
            </div>
          </div>
        </section>

        <section className="controls-section">
          <div className="search-filters">
            <div className="search-box">
              <input 
                type="text" 
                placeholder="Search payments..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="filters">
              <label className="filter-toggle">
                <input 
                  type="checkbox" 
                  checked={filterVerified}
                  onChange={(e) => setFilterVerified(e.target.checked)}
                />
                Verified Only
              </label>
            </div>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-payment-btn"
          >
            + New AutoPay
          </button>
        </section>

        <section className="payments-section">
          <h2>Payment Conditions</h2>
          <div className="payments-grid">
            {filteredPayments.map((payment) => (
              <div 
                key={payment.id} 
                className={`payment-card ${payment.isVerified ? 'verified' : ''}`}
                onClick={() => setSelectedPayment(payment)}
              >
                <div className="payment-header">
                  <h3>{payment.name}</h3>
                  <span className={`status-badge ${payment.isVerified ? 'verified' : 'pending'}`}>
                    {payment.isVerified ? '✅ Verified' : '🔒 Encrypted'}
                  </span>
                </div>
                <p className="payment-desc">{payment.description}</p>
                <div className="payment-details">
                  <div className="detail-item">
                    <span>Amount:</span>
                    <strong>
                      {payment.isVerified ? 
                        `${payment.decryptedValue} (decrypted)` : 
                        '🔒 Encrypted'
                      }
                    </strong>
                  </div>
                  <div className="detail-item">
                    <span>Frequency:</span>
                    <strong>Every {payment.frequency} days</strong>
                  </div>
                </div>
                <div className="payment-footer">
                  <span className="creator">{payment.creator.slice(0, 8)}...</span>
                  <span className="date">{new Date(payment.timestamp * 1000).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
          
          {filteredPayments.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">💸</div>
              <h3>No payment conditions found</h3>
              <p>Create your first encrypted auto-payment condition</p>
              <button 
                onClick={() => setShowCreateModal(true)} 
                className="create-btn"
              >
                Create Payment Condition
              </button>
            </div>
          )}
        </section>
      </main>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>Create AutoPay Condition</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">×</button>
            </div>
            
            <div className="modal-body">
              <div className="fhe-notice">
                <div className="notice-icon">🔐</div>
                <div>
                  <strong>FHE Encrypted Amount</strong>
                  <p>Payment amount will be encrypted using Zama FHE technology</p>
                </div>
              </div>

              <div className="form-group">
                <label>Payment Name</label>
                <input 
                  type="text" 
                  value={newPaymentData.name}
                  onChange={(e) => setNewPaymentData({...newPaymentData, name: e.target.value})}
                  placeholder="e.g., Netflix Subscription"
                />
              </div>

              <div className="form-group">
                <label>Amount (FHE Encrypted)</label>
                <input 
                  type="number" 
                  value={newPaymentData.amount}
                  onChange={(e) => setNewPaymentData({...newPaymentData, amount: e.target.value})}
                  placeholder="Enter amount in wei"
                  min="0"
                />
                <span className="input-hint">Integer only - will be FHE encrypted</span>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Frequency (days)</label>
                  <select 
                    value={newPaymentData.frequency}
                    onChange={(e) => setNewPaymentData({...newPaymentData, frequency: e.target.value})}
                  >
                    <option value="1">Daily</option>
                    <option value="7">Weekly</option>
                    <option value="30">Monthly</option>
                    <option value="90">Quarterly</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Threshold</label>
                  <input 
                    type="number" 
                    value={newPaymentData.threshold}
                    onChange={(e) => setNewPaymentData({...newPaymentData, threshold: e.target.value})}
                    placeholder="Trigger threshold"
                    min="1"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea 
                  value={newPaymentData.description}
                  onChange={(e) => setNewPaymentData({...newPaymentData, description: e.target.value})}
                  placeholder="Describe this payment condition..."
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateModal(false)} 
                className="cancel-btn"
              >
                Cancel
              </button>
              <button 
                onClick={createPayment}
                disabled={creatingPayment || isEncrypting || !newPaymentData.name || !newPaymentData.amount}
                className="create-btn"
              >
                {creatingPayment || isEncrypting ? 'Encrypting...' : 'Create AutoPay'}
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
              <button onClick={() => setSelectedPayment(null)} className="close-btn">×</button>
            </div>
            
            <div className="modal-body">
              <div className="detail-section">
                <h3>{selectedPayment.name}</h3>
                <p>{selectedPayment.description}</p>
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <span>Status</span>
                  <strong className={selectedPayment.isVerified ? 'verified' : 'encrypted'}>
                    {selectedPayment.isVerified ? 'Decrypted & Verified' : 'FHE Encrypted'}
                  </strong>
                </div>
                <div className="detail-item">
                  <span>Amount</span>
                  <strong>
                    {selectedPayment.isVerified ? 
                      `${selectedPayment.decryptedValue} WEI` : 
                      '🔒 Encrypted'
                    }
                  </strong>
                </div>
                <div className="detail-item">
                  <span>Frequency</span>
                  <strong>Every {selectedPayment.frequency} days</strong>
                </div>
                <div className="detail-item">
                  <span>Creator</span>
                  <strong>{selectedPayment.creator.slice(0, 12)}...</strong>
                </div>
              </div>

              {!selectedPayment.isVerified && (
                <div className="verification-section">
                  <button 
                    onClick={() => decryptPayment(selectedPayment.id)}
                    disabled={fheIsDecrypting}
                    className="verify-btn"
                  >
                    {fheIsDecrypting ? 'Decrypting...' : 'Verify Decryption'}
                  </button>
                  <p className="verify-hint">
                    Verify the encrypted amount on-chain using FHE zero-knowledge proofs
                  </p>
                </div>
              )}

              {selectedPayment.isVerified && (
                <div className="decrypted-section">
                  <div className="success-message">
                    <span>✅ Successfully decrypted and verified on-chain</span>
                  </div>
                  <div className="decrypted-value">
                    <span>Decrypted Amount:</span>
                    <strong>{selectedPayment.decryptedValue} WEI</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className={`transaction-toast ${transactionStatus.status}`}>
          <div className="toast-icon">
            {transactionStatus.status === 'pending' && '⏳'}
            {transactionStatus.status === 'success' && '✅'}
            {transactionStatus.status === 'error' && '❌'}
          </div>
          <span>{transactionStatus.message}</span>
        </div>
      )}
    </div>
  );
};

export default App;

