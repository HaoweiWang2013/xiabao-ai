import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Switch } from '../components/Switch';

describe('Switch', () => {
  it('renders a switch', () => {
    const { container } = render(<Switch />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('is checked', () => {
    render(<Switch checked onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
  });

  it('is unchecked', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');
  });

  it('is disabled', () => {
    render(<Switch disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
