import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconButton } from '../components/IconButton';

describe('IconButton', () => {
  it('renders a button with icon', () => {
    const { container } = render(<IconButton size="sm">×</IconButton>);
    expect(screen.getByRole('button')).toHaveTextContent('×');
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders ghost variant', () => {
    render(
      <IconButton variant="ghost" size="sm">
        ○
      </IconButton>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('is disabled', () => {
    render(
      <IconButton disabled size="sm">
        ×
      </IconButton>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
