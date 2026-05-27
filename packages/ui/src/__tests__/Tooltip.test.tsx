import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/Tooltip';

describe('Tooltip', () => {
  it('renders trigger', () => {
    const { container } = render(
      <TooltipProvider>
        <Tooltip open onOpenChange={() => {}}>
          <TooltipTrigger>Hover</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText('Hover')).toBeInTheDocument();
    expect(screen.getAllByText('Tooltip text').length).toBeGreaterThan(0);
    expect(container.firstChild).toMatchSnapshot();
  });
});
