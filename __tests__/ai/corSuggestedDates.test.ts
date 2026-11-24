/**
 * COR review: the suggested USTP class dates. They are only offered; the
 * draft keeps empty dates until the student taps the suggestion.
 */
import {
  USTP_SUGGESTED_TERM,
  fillMissingTermDates,
  suggestedTermDates,
} from '../../src/ai/vision/corReviewModel';

const NOV_2026 = new Date(2026, 10, 24, 12);

describe('suggestedTermDates', () => {
  it('offers Aug 10 – Dec 19, 2026 (official term summary) for a 1st-semester or unlabelled term', () => {
    expect(USTP_SUGGESTED_TERM.startDate).toBe('2026-08-10');
    expect(USTP_SUGGESTED_TERM.endDate).toBe('2026-12-19');
    expect(
      suggestedTermDates({term: '1st Semester AY 2026-2027'}, NOV_2026),
    ).toMatchObject({startDate: '2026-08-10', endDate: '2026-12-19'});
    expect(suggestedTermDates({term: ''}, NOV_2026)).not.toBeNull();
  });

  it('offers nothing for a 2nd semester or summer term, or after the term ends', () => {
    expect(
      suggestedTermDates({term: '2nd Semester AY 2026-2027'}, NOV_2026),
    ).toBeNull();
    expect(suggestedTermDates({term: 'Summer 2027'}, NOV_2026)).toBeNull();
    expect(
      suggestedTermDates({term: ''}, new Date(2026, 11, 20, 12)),
    ).toBeNull();
  });
});

describe('fillMissingTermDates', () => {
  it('fills both dates from the suggestion', () => {
    expect(
      fillMissingTermDates({term: '', startDate: '', endDate: ''}, NOV_2026),
    ).toEqual({startDate: '2026-08-10', endDate: '2026-12-19'});
  });

  it('keeps a date the student already chose', () => {
    expect(
      fillMissingTermDates(
        {term: '', startDate: '2026-08-17', endDate: ''},
        NOV_2026,
      ),
    ).toEqual({startDate: '2026-08-17', endDate: '2026-12-19'});
    expect(
      fillMissingTermDates(
        {term: '', startDate: '', endDate: '2026-12-12'},
        NOV_2026,
      ),
    ).toEqual({startDate: '2026-08-10', endDate: '2026-12-12'});
  });

  it('falls back to 18 weeks when there is no suggestion', () => {
    expect(
      fillMissingTermDates(
        {term: '2nd Semester', startDate: '2027-01-11', endDate: ''},
        NOV_2026,
      ),
    ).toEqual({startDate: '2027-01-11', endDate: '2027-05-17'});
  });
});
