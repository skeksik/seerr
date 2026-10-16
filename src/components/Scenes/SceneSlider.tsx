import type { AdultTitleSliderProps } from '@app/components/Scenes/AdultTitleSlider';
import AdultTitleSlider from '@app/components/Scenes/AdultTitleSlider';

// A row of scenes, for the Discover and Search pages
const SceneSlider = (props: Omit<AdultTitleSliderProps, 'mediaType'>) => (
  <AdultTitleSlider mediaType="scene" {...props} />
);

export default SceneSlider;
