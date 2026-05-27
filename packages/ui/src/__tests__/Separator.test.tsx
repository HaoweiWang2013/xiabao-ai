import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Separator } from '../components/Separator';

describe('Separator', () => {
  it('renders a separator', () => {
    const { container } = render(<Separator />);
    expect(container.firstChild).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('merges className', () => {
    const { container } = render(<Separator className="my-4" />);
    expect(container.firstChild).toHaveClass('my-4');
  });
});
