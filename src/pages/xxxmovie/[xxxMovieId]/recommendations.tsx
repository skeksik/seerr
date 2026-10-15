import AdultTitleList from '@app/components/AdultTitleList';
import type { NextPage } from 'next';

const XxxMovieRecommendationsPage: NextPage = () => {
  return <AdultTitleList mediaType="xxxmovie" list="recommendations" />;
};

export default XxxMovieRecommendationsPage;
