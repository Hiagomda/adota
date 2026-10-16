import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { reportError } from '../crash/reporter';

/** True while TalkBack or VoiceOver is on. Screens use it to stop things that move on their own. */
export function useScreenReader(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch((error: unknown) => {
        reportError(error, { source: 'handled', where: 'a11y:screen-reader' });
      });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}
