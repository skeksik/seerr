import { useEffect } from 'react';

// Modals and slide-overs can lock at once, so the body is unlocked when the
// last of them lets go, back to its own styles from before the first
let locks = 0;
let unlocked: { overflow: string; touchAction: string } | undefined;

/**
 * Hook to lock the body scroll whenever a component is mounted or
 * whenever isLocked is set to true.
 *
 * You can pass in true always to cause a lock on mount/dismount of the component
 * using this hook.
 *
 * @param isLocked Toggle the scroll lock
 * @param disabled Disables the entire hook (allows conditional skipping of the lock)
 */
export const useLockBodyScroll = (
  isLocked: boolean,
  disabled?: boolean
): void => {
  useEffect(() => {
    if (!isLocked || disabled) {
      return;
    }

    if (locks === 0) {
      unlocked = {
        overflow: document.body.style.overflow,
        touchAction: document.body.style.touchAction,
      };
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks === 0 && unlocked) {
        document.body.style.overflow = unlocked.overflow;
        document.body.style.touchAction = unlocked.touchAction;
        unlocked = undefined;
      }
    };
  }, [isLocked, disabled]);
};
