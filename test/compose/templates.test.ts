// Unit tests for renderCuratedTopicsFooter (quick task 260523-oi6).
//
// Locked vocabulary (constraint):
//   vc_securities → VC·증권
//   fair_trade    → 공정거래
//   privacy       → 개인정보
//   labor         → 노동법
//   ip            → 지식재산권
//
// Empty TopicConfig ({}) renders '' (no footer). Unmapped keys pass through
// as-is (snake_case) so adding a YAML key never crashes the email.

import { describe, it, expect } from 'vitest';
import { renderCuratedTopicsFooter } from '../../src/compose/templates.js';

describe('renderCuratedTopicsFooter (quick 260523-oi6)', () => {
  it('renders all 5 Korean labels joined by ", " ending with "."', () => {
    const html = renderCuratedTopicsFooter({
      vc_securities: ['x'],
      fair_trade: ['y'],
      privacy: ['z'],
      labor: ['a'],
      ip: ['b'],
    });
    expect(html).toContain(
      '현재 이 다이제스트는 다음 분야를 큐레이션합니다: VC·증권, 공정거래, 개인정보, 노동법, 지식재산권.',
    );
  });

  it('empty TopicConfig returns empty string (clean-run invisible posture)', () => {
    expect(renderCuratedTopicsFooter({})).toBe('');
  });

  it('unknown key passes through verbatim (snake_case visible, no crash)', () => {
    const html = renderCuratedTopicsFooter({
      vc_securities: ['x'],
      future_topic: ['y'],
    });
    expect(html).toContain('VC·증권');
    expect(html).toContain('future_topic');
  });

  it('iteration order matches Object.keys insertion order (YAML order preserved)', () => {
    const html = renderCuratedTopicsFooter({
      ip: ['a'],
      vc_securities: ['b'],
    });
    expect(html.indexOf('지식재산권')).toBeLessThan(html.indexOf('VC·증권'));
  });

  it('empty keyword list does NOT exclude the key (presence is what counts)', () => {
    expect(renderCuratedTopicsFooter({ vc_securities: [] })).toContain('VC·증권');
  });

  it('XSS defense: hostile key name is escaped (no raw <script> in output)', () => {
    const html = renderCuratedTopicsFooter({ '<script>alert(1)</script>': [] });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
