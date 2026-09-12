export type ErrCode =
  | 'NET-01' | 'NET-02'
  | 'API-01' | 'API-02'
  | 'MAP-01' | 'MAP-02'
  | 'DATA-01' | 'STOR-01'
  | 'IMG-01' | 'GEO-01' | 'GEO-02' | 'GEO-03'
  | 'UNK-01';

const MESSAGES: Record<ErrCode, string> = {
  'NET-01': 'Нет интернета — обновление недоступно',
  'NET-02': 'Сервер долго не отвечает, попробуйте позже',
  'API-01': 'Сервер обновления недоступен',
  'API-02': 'Не удалось разобрать ответ сервера',
  'MAP-01': 'Не удалось скачать карту',
  'MAP-02': 'Файл карты повреждён',
  'DATA-01': 'Недостаточно места для данных',
  'STOR-01': 'Хранилище недоступно',
  'IMG-01': 'Фото недоступно',
  'GEO-01': 'Геолокация недоступна в этом браузере',
  'GEO-02': 'Доступ к геолокации запрещён — разрешите его в настройках',
  'GEO-03': 'Не удалось определить местоположение, попробуйте ещё раз',
  'UNK-01': 'Непредвиденная ошибка',
};

export class AppError extends Error {
  constructor(public code: ErrCode, public cause?: unknown) {
    super(code);
  }
}

export function toUserMessage(e: unknown): string {
  const code: ErrCode = e instanceof AppError ? e.code : 'UNK-01';
  return `${MESSAGES[code]} (${code})`;
}
