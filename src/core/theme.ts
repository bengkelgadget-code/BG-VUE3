export interface ThemeTokens {
  bgApp: string;
  surfaceCard: string;
  colorPrimary: string;
  colorIncome: string;
  colorExpense: string;
  colorDanger: string;
  colorWarning: string;
  textMain: string;
  textSecondary: string;
}

export const lightTokens: ThemeTokens = {
  bgApp: 'var(--bg-app)',
  surfaceCard: 'var(--surface-card)',
  colorPrimary: 'var(--color-primary)',
  colorIncome: 'var(--color-income)',
  colorExpense: 'var(--color-expense)',
  colorDanger: 'var(--color-danger)',
  colorWarning: 'var(--color-warning)',
  textMain: 'var(--text-main)',
  textSecondary: 'var(--text-secondary)',
};

export const darkTokens: ThemeTokens = {
  bgApp: 'var(--bg-app)',
  surfaceCard: 'var(--surface-card)',
  colorPrimary: 'var(--color-primary)',
  colorIncome: 'var(--color-income)',
  colorExpense: 'var(--color-expense)',
  colorDanger: 'var(--color-danger)',
  colorWarning: 'var(--color-warning)',
  textMain: 'var(--text-main)',
  textSecondary: 'var(--text-secondary)',
};
