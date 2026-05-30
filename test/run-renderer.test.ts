import { describe, expect, it } from 'vitest';

import { renderCard } from '../src/card/run-renderer';
import type { RunState } from '../src/card/run-state';

function cardText(card: object): string {
  return JSON.stringify(card);
}

describe('renderCard', () => {
  it('shows reasoning while the run is still streaming', () => {
    const state: RunState = {
      blocks: [],
      reasoning: { content: 'checking the request', active: true },
      footer: 'thinking',
      terminal: 'running',
    };

    expect(cardText(renderCard(state))).toContain('checking the request');
  });

  it('removes reasoning from the completed card', () => {
    const state: RunState = {
      blocks: [{ kind: 'text', content: 'final answer', streaming: false }],
      reasoning: { content: 'hidden chain of thought', active: false },
      footer: null,
      terminal: 'done',
    };

    const rendered = cardText(renderCard(state));
    expect(rendered).toContain('final answer');
    expect(rendered).not.toContain('hidden chain of thought');
  });
});
