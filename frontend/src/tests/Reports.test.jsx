import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Reports from '../pages/Reports';

vi.mock('../services/reportsApi', () => ({
  getReportTypes: vi.fn(() => Promise.resolve({ data: [{ id: 'production', title: 'Production Report', formats: ['csv', 'pdf'] }] })),
  previewReport: vi.fn(),
  exportReportCsv: vi.fn(),
  exportReportPdf: vi.fn(),
}));

describe('Reports page', () => {
  it('renders report filters and export actions', async () => {
    render(<Reports />);

    expect(screen.getByText('Preview & Export Reports')).toBeInTheDocument();
    expect(screen.getByLabelText('Report type')).toBeInTheDocument();
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
    expect((await screen.findAllByText('Production Report')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export PDF/i })).toBeInTheDocument();
  });
});
