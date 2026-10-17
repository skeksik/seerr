import AdultBrowse from '@app/components/Scenes/AdultBrowse';
import defineMessages from '@app/utils/defineMessages';

const messages = defineMessages('components.Scenes.TrendingScenes', {
  trendingScenes: 'Trending Scenes',
});

// Like the Trending page, for scenes: the Scenes tab with its filters, held
// to StashDB's trending order, which has no daily or weekly window, so there
// is nothing to pick
const TrendingScenes = () => (
  <AdultBrowse
    kind="scene"
    fixedSort="trending.desc"
    title={messages.trendingScenes}
  />
);

export default TrendingScenes;
