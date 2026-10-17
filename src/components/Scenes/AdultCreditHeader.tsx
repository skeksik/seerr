import Ellipsis from '@app/assets/ellipsis.svg';
import type { ProfileLink } from '@app/components/AdultProfileLinks';
import AdultProfileLinks from '@app/components/AdultProfileLinks';
import CachedImage from '@app/components/Common/CachedImage';
import ImageFader from '@app/components/Common/ImageFader';
import PageTitle from '@app/components/Common/PageTitle';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import Link from 'next/link';
import { useState } from 'react';
import type { IntlShape } from 'react-intl';
import { useIntl } from 'react-intl';
import TruncateMarkup from 'react-truncate-markup';

const messages = defineMessages('components.Scenes.AdultCreditHeader', {
  born: 'Born {date}',
  active: 'Active {start}–{end}',
  present: 'present',
  partOf: 'Part of {studio}',
  alsoknownas: 'Also Known As: {names}',
});

// A performer's birth, home and career, as the person page lists them
export const personAttributes = (
  intl: IntlShape,
  {
    birthDate,
    place,
    careerStart,
    careerEnd,
  }: {
    birthDate?: string;
    place?: string;
    careerStart?: number;
    careerEnd?: number;
  }
): string[] => {
  const attributes: string[] = [];

  if (birthDate) {
    attributes.push(
      intl.formatMessage(messages.born, {
        date: intl.formatDate(birthDate, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        }),
      })
    );
  }
  if (place) {
    attributes.push(place);
  }
  if (careerStart) {
    attributes.push(
      intl.formatMessage(messages.active, {
        start: careerStart,
        end: careerEnd ?? intl.formatMessage(messages.present),
      })
    );
  }

  return attributes;
};

interface AdultCreditHeaderProps {
  type: 'performer' | 'studio';
  name: string;
  imageUrl?: string;
  // Backdrops of their first titles, faded through like a person page's
  backdrops: string[];
  links: ProfileLink[];
  attributes?: string[];
  // A studio's network
  partOf?: { name: string; href: string };
  aliases?: string[];
  bio?: string;
  // Buttons below
  actions?: React.ReactNode;
  // The media type selector, top right like the person page's
  picker?: React.ReactNode;
}

// The person page's header, for StashDB performers and studios
const AdultCreditHeader = ({
  type,
  name,
  imageUrl,
  backdrops,
  links,
  attributes = [],
  partOf,
  aliases = [],
  bio,
  actions,
  picker,
}: AdultCreditHeaderProps) => {
  const intl = useIntl();
  const [showBio, setShowBio] = useState(false);

  return (
    <>
      <PageTitle title={name} />
      {backdrops.length > 0 && (
        <div className="absolute left-0 right-0 top-0 z-0 h-96">
          <ImageFader
            isDarker
            imageType="stashdb"
            backgroundImages={backdrops}
          />
        </div>
      )}
      <div className="relative z-10 mb-8 mt-4 flex flex-col items-center lg:flex-row lg:items-start">
        {imageUrl && (
          <div
            className={`relative mb-6 mr-0 flex-shrink-0 overflow-hidden ring-1 ring-gray-700 lg:mb-0 lg:mr-6 ${
              type === 'performer'
                ? 'h-36 w-36 rounded-full lg:h-44 lg:w-44'
                : 'h-24 w-60 rounded-lg bg-gray-800 p-3'
            }`}
          >
            <CachedImage
              type="stashdb"
              src={imageUrl}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: type === 'performer' ? 'cover' : 'contain',
                objectPosition: type === 'performer' ? 'top' : 'center',
              }}
              fill
            />
          </div>
        )}
        <div className="w-full text-center text-gray-300 lg:text-left">
          <div className="flex w-full items-center justify-center lg:justify-between">
            <h1 className="text-3xl text-white lg:text-4xl">{name}</h1>
            {picker && (
              <div className="hidden flex-shrink-0 lg:block">{picker}</div>
            )}
          </div>
          <div className="mt-2">
            <AdultProfileLinks links={links} />
          </div>
          <div className="mb-2 mt-2 space-y-1 text-xs text-white sm:text-sm lg:text-base">
            {attributes.length > 0 && <div>{attributes.join(' | ')}</div>}
            {partOf && (
              <div>
                {intl.formatMessage(messages.partOf, {
                  studio: (
                    <Link
                      key="partOf"
                      href={partOf.href}
                      className="font-semibold hover:underline"
                    >
                      {partOf.name}
                    </Link>
                  ),
                })}
              </div>
            )}
            {aliases.length > 0 && (
              <div>
                {intl.formatMessage(messages.alsoknownas, {
                  names: aliases.reduce((prev, curr) =>
                    intl.formatMessage(globalMessages.delimitedlist, {
                      a: prev,
                      b: curr,
                    })
                  ),
                })}
              </div>
            )}
          </div>
          {picker && <div className="lg:hidden">{picker}</div>}
          {bio && (
            <div className="relative text-left">
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
              <div
                className="group outline-none ring-0"
                onClick={() => setShowBio((show) => !show)}
                role="button"
                tabIndex={-1}
              >
                <TruncateMarkup
                  lines={showBio ? 200 : 6}
                  ellipsis={
                    <Ellipsis className="relative -top-0.5 ml-2 inline-block opacity-70 transition duration-300 group-hover:opacity-100" />
                  }
                >
                  <p className="whitespace-pre-line pt-2 text-sm lg:text-base">
                    {bio}
                  </p>
                </TruncateMarkup>
              </div>
            </div>
          )}
          {actions && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              {actions}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AdultCreditHeader;
