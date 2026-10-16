const REPEATED_SUBJECT_TERMS = /\b(flotilla|fleet|row of|line of|chain of|series of|several|multiple|many|bunch of|group of|cluster of|trail of|caravan|convoy|procession|armada)\b/;

/**
 * Manual AI Draw can intentionally request repeated subjects. Automated scene
 * maps explicitly disable that heuristic because every call represents one
 * landmark sticker, even when its description mentions a settlement cluster.
 */
export function wantsRepeatedDiscreteSubjects(prompt: string, repeatSubjects?: boolean) {
  if (repeatSubjects === false) return false;
  if (repeatSubjects === true) return true;
  return REPEATED_SUBJECT_TERMS.test(prompt.toLowerCase());
}
