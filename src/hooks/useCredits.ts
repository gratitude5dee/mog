import { useState } from 'react';

export const useCredits = () => {
  const [availableCredits] = useState<number | null>(100);
  const [isLoading] = useState(false);

  return {
    availableCredits,
    isLoading,
    transactions: [],
    useCredits: async () => true,
    addCredits: async () => true,
    refreshCredits: () => {},
    refreshTransactions: () => {},
  };
};
