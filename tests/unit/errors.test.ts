import { AppError, toUserMessage } from '../../src/core/errors';

test('toUserMessage includes code', () => {
  expect(toUserMessage(new AppError('NET-01'))).toMatch(/NET-01/);
});

test('unknown error maps to generic with code', () => {
  expect(toUserMessage(new Error('boom'))).toMatch(/UNK-01/);
});
