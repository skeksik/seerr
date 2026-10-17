import { sliderTitles } from '@app/components/Discover/constants';
import AdultBrowse from '@app/components/Scenes/AdultBrowse';

// Like the Trending page, for scenes: the Scenes tab with its filters, held
// to StashDB's trending order, which has no daily or weekly window, so there
// is nothing to pick
const TrendingScenes = () => (
  <AdultBrowse
    kind="scene"
    fixedSort="trending.desc"
    title={sliderTitles.trendingScenes}
  />
);

export default TrendingScenes;
