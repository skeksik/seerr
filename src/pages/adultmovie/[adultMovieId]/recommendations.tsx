import AdultTitleList from '@app/components/AdultTitleList';
import type { NextPage } from 'next';

const AdultMovieRecommendationsPage: NextPage = () => {
  return <AdultTitleList mediaType="adultmovie" list="recommendations" />;
};

export default AdultMovieRecommendationsPage;
