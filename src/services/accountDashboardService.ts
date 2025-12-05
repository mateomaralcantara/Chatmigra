import { AccountDashboardData, Plan } from '../types';

// This function simulates fetching data from a backend that would query Supabase tables.
// In a real application, you would pass the user's ID to this function.
export const getAccountDashboardData = async (): Promise<AccountDashboardData> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 600));

  // This is where you would typically make a call to your backend or directly to Supabase
  // using RPC functions for security.
  // e.g., const { data, error } = await supabase.rpc('get_user_dashboard_data');

  // For now, we return mock data based on a simulated 'pro' plan user.
  const mockData: AccountDashboardData = {
    subscription: {
      planId: Plan.PRO,
      planName: 'Pro Plan',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric'
      }),
    },
    quotas: {
      messagesRemaining: 432,
      messagesMax: 1000,
      tokensRemaining: 185430,
      tokensMax: 250000,
    },
    payments: [
      { id: 'pi_3Pabcde...', date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'), amount: '$19.95 USD', status: 'Pagado' },
      { id: 'pi_3Oxyz...', date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'), amount: '$19.95 USD', status: 'Pagado' },
      { id: 'pi_3N123...', date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'), amount: '$19.95 USD', status: 'Pagado' },
    ],
  };

  // You could throw an error to test the error state in the UI
  // if (Math.random() > 0.8) {
  //   throw new Error("Simulated server error");
  // }

  return mockData;
};
