import type { SyntheticEvent } from 'react';

export const avatarFallback = '/images/avatar-fallback.svg';

export function applyAvatarFallback(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (!image.src.endsWith(avatarFallback)) image.src = avatarFallback;
}
