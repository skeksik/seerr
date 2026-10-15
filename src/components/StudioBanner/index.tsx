import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.StudioBanner', {
  moreFrom: 'More from {studio}',
});

interface StudioBannerProps {
  href: string;
  studio: string;
  imageUrl?: string;
  imageType: 'stashdb' | 'tpdb';
}

// The movie page's collection banner, for a studio's other titles
const StudioBanner = ({
  href,
  studio,
  imageUrl,
  imageType,
}: StudioBannerProps) => {
  const intl = useIntl();

  return (
    <div className="mb-6">
      <Link href={href}>
        <div className="group relative z-0 scale-100 transform-gpu cursor-pointer overflow-hidden rounded-lg bg-gray-800 bg-cover bg-center shadow-md ring-1 ring-gray-700 transition duration-300 hover:scale-105 hover:ring-gray-500">
          {imageUrl && (
            <div className="absolute inset-0 z-0">
              <CachedImage
                type={imageType}
                src={imageUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                fill
              />
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(180deg, rgba(31, 41, 55, 0.47) 0%, rgba(31, 41, 55, 0.80) 100%)',
                }}
              />
            </div>
          )}
          <div className="relative z-10 flex h-full items-center justify-between p-4 text-gray-200 transition duration-300 group-hover:text-white">
            <div>{intl.formatMessage(messages.moreFrom, { studio })}</div>
            <Button buttonSize="sm">
              {intl.formatMessage(globalMessages.view)}
            </Button>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default StudioBanner;
