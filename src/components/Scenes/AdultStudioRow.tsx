import { creditHref } from '@app/components/Common/adultRoutes';
import SliderHeader from '@app/components/Common/SliderHeader';
import CompanyCard from '@app/components/CompanyCard';
import SeeAllStudiosCard from '@app/components/Scenes/SeeAllStudiosCard';
import Slider from '@app/components/Slider';
import { stashImageUrl } from '@app/utils/stashImage';

interface AdultStudioRowProps {
  sliderKey: string;
  title: string;
  // Every studio of the row, also behind its last card when there are more
  linkUrl: string;
  // Whether the list behind the row holds more than it shows; by default
  // when there are more studios than fit
  hasMore?: boolean;
  // StashDB studios or ThePornDB sites, for their images
  mediaType: 'scene' | 'adultmovie';
  // Until they load. Sites linked to a StashDB studio open its page
  studios?: {
    id: string | number;
    name: string;
    imageUrl?: string;
    stashDbId?: string;
  }[];
}

// Studio cards are wide, like scene cards
const SLIDER_LIMIT = 13;

// The studio row of the Discover page, for StashDB and ThePornDB studios
const AdultStudioRow = ({
  sliderKey,
  title,
  linkUrl,
  mediaType,
  studios,
  hasMore = (studios?.length ?? 0) > SLIDER_LIMIT,
}: AdultStudioRowProps) => (
  <>
    <SliderHeader title={title} linkUrl={linkUrl} />
    <Slider
      sliderKey={sliderKey}
      isLoading={!studios}
      isEmpty={false}
      // Shaped like the studio cards they stand in for
      placeholder={
        <div className="h-32 w-56 transform-gpu animate-pulse cursor-pointer rounded-xl bg-gray-700 ring-1 ring-gray-700 transition duration-300 ease-in-out hover:scale-105 hover:ring-gray-500 sm:h-36 sm:w-72" />
      }
      items={[
        ...(studios ?? [])
          .slice(0, SLIDER_LIMIT)
          .map((studio) => (
            <CompanyCard
              key={`${sliderKey}-${studio.id}`}
              name={studio.name}
              image={
                mediaType === 'scene'
                  ? stashImageUrl(studio.imageUrl, 300)
                  : studio.imageUrl
              }
              imageType={mediaType === 'scene' ? 'stashdb' : 'tpdb'}
              url={creditHref('studio', studio.stashDbId ?? studio.id)}
            />
          )),
        // Whether there are more is only known once they are in
        ...(studios && hasMore
          ? [<SeeAllStudiosCard key={`${sliderKey}-all`} url={linkUrl} />]
          : []),
      ]}
    />
  </>
);

export default AdultStudioRow;
