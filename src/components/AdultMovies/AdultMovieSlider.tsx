import type { AdultTitleSliderProps } from '@app/components/Scenes/AdultTitleSlider';
import AdultTitleSlider from '@app/components/Scenes/AdultTitleSlider';

// A row of adult movies, for the Discover page
const AdultMovieSlider = (props: Omit<AdultTitleSliderProps, 'mediaType'>) => (
  <AdultTitleSlider mediaType="adultmovie" {...props} />
);

export default AdultMovieSlider;
