/** Доступные аватарки: id → emoji для отображения за столом и в лобби */
export const AVATARS = {
  fox: '🦊',
  bear: '🐻',
  wolf: '🐺',
  owl: '🦉',
  cat: '🐱',
  dog: '🐶',
  tiger: '🐯',
  rabbit: '🐰',
  dragon: '🐲',
  unicorn: '🦄',
  frog: '🐸',
  panda: '🐼',
  lion: '🦁',
  monkey: '🐵',
  butterfly: '🦋',
  raccoon: '🦝',
};

export const AVATAR_IDS = Object.keys(AVATARS);

export function getAvatarEmoji(avatarId) {
  return AVATARS[avatarId] || AVATARS.fox;
}
