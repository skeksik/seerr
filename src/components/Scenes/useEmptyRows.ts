import { useCallback, useState } from 'react';

// Whether all of a page's title rows came back empty, so the page can say
// so; rows report themselves once they know
const useEmptyRows = (keys: string[]) => {
  const [empty, setEmpty] = useState<Record<string, boolean>>({});
  const report = useCallback(
    (key: string, isEmpty: boolean) =>
      setEmpty((previous) =>
        previous[key] === isEmpty ? previous : { ...previous, [key]: isEmpty }
      ),
    []
  );

  return { allEmpty: keys.every((key) => empty[key]), report };
};

export default useEmptyRows;
