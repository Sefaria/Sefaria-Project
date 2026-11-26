import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HBarChart } from '../HBarChart';

describe('HBarChart', () => {
  it('flags zero-valued rows so they draw no bar, and leaves other rows alone', () => {
    render(
      <HBarChart
        ariaLabel="Reach"
        rows={[
          { label: 'About 10', value: 0 },
          { label: 'About 100', value: 5 },
        ]}
      />
    );
    const [zero, nonZero] = screen.getAllByRole('listitem').map((li) => li.querySelector('span span span'));
    expect(zero?.className).toMatch(/zero/);
    expect(nonZero?.className).not.toMatch(/zero/);
  });
});
