import React, { useEffect } from 'react';
import styles from './Toast.module.css';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  message: string;
  type: ToastType;
}

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onClose, duration = 5000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      <span className={styles.message}>{message}</span>
      <button className={styles.close} onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  );
};
