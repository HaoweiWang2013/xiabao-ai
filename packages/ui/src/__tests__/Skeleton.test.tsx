import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from '../components/Skeleton';

describe('Skeleton', () => {
  it('renders a skeleton div', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('merges className', () => {
    const { container } = render(<Skeleton className="h-10 w-20" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('h-10', 'w-20');
  });
});
