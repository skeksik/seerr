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
  // StashDB studios, until they load
  studios?: { id: string; name: string; imageUrl?: string }[];
}

// Studio cards are wide, like scene cards
const SLIDER_LIMIT = 13;

// The studio row of the Discover page, and a network's studios
const AdultStudioRow = ({
  sliderKey,
  title,
  linkUrl,
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
        <div className="h-32 w-56 animate-pulse rounded-xl bg-gray-700 sm:h-36 sm:w-72" />
      }
      items={[
        ...(studios ?? [])
          .slice(0, SLIDER_LIMIT)
          .map((studio) => (
            <CompanyCard
              key={`${sliderKey}-${studio.id}`}
              name={studio.name}
              image={stashImageUrl(studio.imageUrl, 300)}
              imageType="stashdb"
              url={creditHref('studio', studio.id)}
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
