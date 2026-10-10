import { escapeLikePattern } from './like-pattern';

describe('escapeLikePattern', () => {
  it.each([
    ['plain text', 'plain text'],
    ['100%', '100\\%'],
    ['snake_case', 'snake\\_case'],
    ['back\\slash', 'back\\\\slash'],
    ['%_\\', '\\%\\_\\\\'],
  ])('%p → %p', (input, expected) => {
    expect(escapeLikePattern(input)).toBe(expected);
  });
});
