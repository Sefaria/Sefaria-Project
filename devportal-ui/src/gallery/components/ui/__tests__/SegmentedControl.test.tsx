import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '../SegmentedControl';

const options = [
  { value: 'grid', label: 'Grid', icon: <svg aria-hidden="true" /> },
  { value: 'list', label: 'List', icon: <svg aria-hidden="true" /> },
] as const;

describe('SegmentedControl', () => {
  it('exposes the pressed state with aria-pressed on named buttons in a named group', () => {
    render(<SegmentedControl label="Show projects as" options={options} value="grid" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Show projects as' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the chosen value', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="View" options={options} value="grid" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('has no axe violations', async () => {
    const { container } = render(<SegmentedControl label="View" options={options} value="list" onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
