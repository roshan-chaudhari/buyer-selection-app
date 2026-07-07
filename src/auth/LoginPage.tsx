import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  X, 
  FileSpreadsheet,
  Key,
  Trash2,
  LogIn,
} from 'lucide-react';

import styles from './LoginPage.module.scss';
import { 
  handleIonapiUpload, 
  loginWithIonapi, 
  type IonapiConfig 
} from './authService';
import Footer from '../components/Footer';
import Button from '../components/Button';


interface UploadedFile {
  name: string;
  size: number;
  type: string;
}

interface LoginPageProps {
  onLoginSuccess?: (tenantName?: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  // Force dark theme on LoginPage mount
  useEffect(() => {
    document.documentElement.classList.remove('theme-light');
  }, []);

  // File upload states
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadError, setUploadError] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTimerRef = useRef<number | null>(null);

  // Saved identities states
  const [savedIdentities, setSavedIdentities] = useState<IonapiConfig[]>(() => {
    const listStr = localStorage.getItem("ionapiList");
    if (listStr) {
      try {
        return JSON.parse(listStr);
      } catch (e) {
        console.error("Failed to parse saved identities", e);
        return [];
      }
    }
    return [];
  });
  const [lastUploadedConfig, setLastUploadedConfig] = useState<IonapiConfig | null>(null);

  // Load saved configurations from localStorage dynamically
  const loadSavedIdentities = () => {
    const listStr = localStorage.getItem("ionapiList");
    if (listStr) {
      try {
        setSavedIdentities(JSON.parse(listStr));
      } catch (e) {
        console.error("Failed to parse saved identities", e);
      }
    } else {
      setSavedIdentities([]);
    }
  };



  // Wrapper: notify parent (App) of successful login before OAuth redirect
  const handleLogin = (config: IonapiConfig) => {
    if (onLoginSuccess) {
      onLoginSuccess(config.ti || config.cn);
    }
    loginWithIonapi(config);
  };

  // Handle deletion of an identity from list and localStorage
  const handleDeleteIdentity = (cn: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedIdentities.filter(item => item.cn !== cn);
    localStorage.setItem("ionapiList", JSON.stringify(updated));
    setSavedIdentities(updated);
  };

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper to get file icon based on type/extension
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'ionapi') {
      return <FileSpreadsheet className={`w-10 h-10 text-emerald-500 ${styles.bounceSlow}`} />;
    }
    return <FileText className={`w-10 h-10 text-blue-500 ${styles.bounceSlow}`} />;
  };

  // Handle Drag Events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Start simulated upload progress
  const startSimulatedUpload = (file: File) => {
    setUploadState('uploading');
    setUploadProgress(0);
    setUploadError('');

    if (uploadTimerRef.current) {
      window.clearInterval(uploadTimerRef.current);
    }

    let progress = 0;
    uploadTimerRef.current = window.setInterval(() => {
      progress += 10;
      if (progress >= 100) {
        if (uploadTimerRef.current) window.clearInterval(uploadTimerRef.current);
        setUploadProgress(100);
        
        // Process file JSON, store configurations, and upload to backend
        handleIonapiUpload(file)
          .then((config) => {
            setUploadState('success');
            setLastUploadedConfig(config);
            setUploadedFile({
              name: file.name,
              size: file.size,
              type: file.type
            });
            loadSavedIdentities();
          })
          .catch((err: unknown) => {
            const error = err as Error;
            setUploadError(error.message || "Failed to process the credentials file.");
            setUploadState('error');
          });
      } else {
        setUploadProgress(progress);
      }
    }, 150);
  };

  // Handle Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      // Optional restriction validation
      const ext = droppedFile.name.split('.').pop()?.toLowerCase();
      const allowedExtensions = ['ionapi'];
      
      if (ext && !allowedExtensions.includes(ext)) {
        setUploadError(`Unsupported file format. Please upload: ${allowedExtensions.join(', ')}`);
        setUploadState('error');
        return;
      }

      startSimulatedUpload(droppedFile);
    }
  };

  // Handle File Input Change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      const allowedExtensions = ['ionapi'];
      
      if (ext && !allowedExtensions.includes(ext)) {
        setUploadError(`Unsupported file format. Please upload: ${allowedExtensions.join(', ')}`);
        setUploadState('error');
        return;
      }
      
      startSimulatedUpload(selectedFile);
    }
  };

  // Clear Uploaded File
  const handleClearFile = () => {
    if (uploadTimerRef.current) {
      window.clearInterval(uploadTimerRef.current);
    }
    setUploadedFile(null);
    setUploadProgress(0);
    setUploadState('idle');
    setUploadError('');
    setLastUploadedConfig(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`${styles.loginContainer} font-sans selection:bg-[var(--color-primary)] selection:text-white`}>
      {/* 3D Geometric Step Backdrops */}
      <div className={styles.bgStep1} />
      <div className={styles.bgStep2} />
      
      {/* LEFT SIDE: File Upload - Centered Vertically & Horizontally */}
      <div className={styles.leftPanel}>
        
        {/* Subtle grid pattern / visual graphics */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] pointer-events-none" />

        <div className="w-full max-w-md flex flex-col items-center justify-center relative z-10">
          {/* Section title & subtitle */}
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2 text-white">
              Credentials & Key Drop
            </h2>
            <p className="text-[var(--color-text-secondary)] text-sm max-w-sm mx-auto">
              Securely upload your configuration, license keys, or auth token profiles here for instant credential verification.
            </p>
          </div>

          {/* Interactive Card Container */}
          <div className={styles.glassCard}>
            
            {/* ID for automated browser testing */}
            <div 
              id="file-dropzone-container"
              className="w-full"
            >
              {uploadState === 'idle' && (
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`${styles.dropZone} ${dragActive ? styles.dragActive : ''}`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".ionapi"
                  />
                  
                  <div className={`p-4 rounded-full bg-[rgba(255,255,255,0.02)] border border-[var(--color-border)] mb-4 text-[var(--color-text-secondary)] transition-transform duration-300 ${dragActive ? 'scale-110 text-[var(--color-primary)]' : ''}`}>
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  
                  <p className="text-sm font-medium text-white mb-1">
                    Drag and drop file here
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)] mb-4">
                    or click to browse from device
                  </p>
                  
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-primary)] font-semibold bg-[rgba(0,114,237,0.1)] py-1 px-2.5 rounded-full">
                    Supported: ionapi
                  </span>
                </div>
              )}

              {uploadState === 'uploading' && (
                <div className="w-full py-12 px-6 rounded-xl border border-[var(--color-border)] flex flex-col items-center justify-center text-center bg-[rgba(255,255,255,0.01)]">
                  <div className="relative w-16 h-16 flex items-center justify-center mb-4">
                    <div className="absolute inset-0 rounded-full border-4 border-[rgba(255,255,255,0.03)] border-t-[var(--color-primary)] animate-spin" />
                    <UploadCloud className="w-6 h-6 text-[var(--color-primary)]" />
                  </div>
                  
                  <p className="text-sm font-medium text-white mb-2">
                    Uploading credentials profile...
                  </p>
                  
                  <div className="w-full max-w-xs bg-[rgba(255,255,255,0.05)] rounded-full h-1.5 mb-2 overflow-hidden">
                    <div 
                      className="bg-[var(--color-primary)] h-1.5 rounded-full transition-all duration-150 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between w-full max-w-xs text-xs text-[var(--color-text-secondary)]">
                    <span>Progress</span>
                    <span className="font-semibold text-[var(--color-primary)]">{uploadProgress}%</span>
                  </div>
                  
                  <Button 
                    variant="danger" 
                    onClick={handleClearFile} 
                    className="mt-6 !text-xs !px-3 !py-1.5 border border-rose-500/20 hover:bg-rose-500/10 bg-transparent text-rose-400 hover:text-rose-300 font-medium"
                  >
                    Cancel Upload
                  </Button>
                </div>
              )}

              {uploadState === 'success' && uploadedFile && (
                <div className={styles.uploadSuccessBlock}>
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-400 animate-pulse" />
                  </div>
                  
                  <p className="text-sm font-semibold text-white mb-1">
                    File Uploaded Successfully!
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)] mb-6">
                    Ready to authenticate using token profile
                  </p>
                  
                  {/* File Metadata Card */}
                  <div className={styles.fileCard}>
                    <div className="flex items-center gap-3 min-w-0">
                      {getFileIcon(uploadedFile.name)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate max-w-[180px]">
                          {uploadedFile.name}
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {formatFileSize(uploadedFile.size)}
                        </p>
                      </div>
                    </div>
                    
                    <Button
                      variant="outline"
                      onClick={handleClearFile}
                      aria-label="Remove uploaded file"
                      className="!p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white hover:bg-[rgba(255,255,255,0.05)] transition-all shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {lastUploadedConfig && (
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={() => handleLogin(lastUploadedConfig)}
                      icon={<LogIn className="w-4 h-4" />}
                      className="mb-3 shadow-lg shadow-blue-500/20 !py-2.5"
                    >
                      Login with {lastUploadedConfig.cn}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    fullWidth
                    onClick={handleClearFile}
                    className="text-white hover:bg-[rgba(255,255,255,0.05)] !py-2.5"
                  >
                    Upload Another File
                  </Button>
                </div>
              )}

              {uploadState === 'error' && (
                <div className={styles.uploadErrorBlock}>
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-full mb-4">
                    <AlertCircle className="w-8 h-8 text-rose-400" />
                  </div>
                  
                  <p className="text-sm font-semibold text-white mb-1">
                    Upload Failed
                  </p>
                  <p className="text-xs text-rose-300 mb-6 max-w-xs mx-auto">
                    {uploadError || "There was an issue processing your file."}
                  </p>
                  
                  <Button
                    variant="danger"
                    onClick={handleClearFile}
                    className="!py-2.5 !px-6"
                  >
                    Try Another File
                  </Button>
                </div>
              )}
            </div>

            {/* Saved Configurations List */}
            {savedIdentities.length > 0 && (
              <div className="mt-6 pt-6 border-t border-[var(--color-border)]">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Key className="w-4 h-4 text-[var(--color-primary)]" />
                    Saved Profiles ({savedIdentities.length})
                  </h4>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {savedIdentities.map((f) => (
                    <div 
                      key={f.cn} 
                      className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[rgba(255,255,255,0.01)] hover:bg-[rgba(255,255,255,0.03)] hover:border-primary/20 transition-all cursor-pointer group"
                      onClick={() => handleLogin(f)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded bg-[rgba(0,114,237,0.1)] text-[var(--color-primary)]">
                          <Key className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="text-xs font-semibold text-white truncate max-w-[150px] sm:max-w-[180px]">
                            {f.cn}
                          </p>
                          <p className="text-[10px] text-[var(--color-text-secondary)] truncate max-w-[150px] sm:max-w-[180px]">
                            Tenant: {f.ti}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          onClick={(e) => {
                            e?.stopPropagation();
                            handleLogin(f);
                          }}
                          icon={<LogIn className="w-3.5 h-3.5" />}
                          className="!p-1.5 !text-xs opacity-90 hover:opacity-100 font-semibold"
                        >
                          <span className="hidden sm:inline">Login</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={(e) => handleDeleteIdentity(f.cn, e)}
                          title="Delete saved configuration"
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                          className="!p-1.5 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/5 transition-all"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Credentials Login Form - Centered Vertically & Horizontally */}
      <div className={styles.rightPanel}>
        
        <div className="w-full max-w-md relative z-10 flex flex-col items-center text-center">
          
          {/* Logo / Brand Name Area */}
          <div className="mb-8 w-full flex justify-center">
            <img 
              src="/cl-whitelogo-01.svg" 
              alt="CrossLine Brand Logo" 
              className="w-full max-w-[660px] h-auto opacity-95 hover:opacity-100 transition-opacity"
            />
          </div>

          {/* Welcome Back Header */}
          <div className="flex flex-col items-center text-center">
            <h1 className="text-3xl font-extrabold tracking-tight mb-2 text-white">
              Welcome Back
            </h1>
            <p className="text-[var(--color-text-secondary)] text-sm max-w-xs mx-auto">
              Access your Buyer Selection Dashboard by selecting a saved profile or uploading a credentials file.
            </p>
          </div>
          
        </div>
      </div>

      <Footer className={styles.loginFooter} />
    </div>
  );
}
