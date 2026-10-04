function publicError(error, requestId) {
  const message = String(error?.message || 'Operation failed');
  if (message === 'Invalid request payload' || message === 'Request too large')
    return {code:'INVALID_REQUEST',message,requestId};
  if (message === 'Untrusted sender' || message === 'Review access unavailable')
    return {code:'UNTRUSTED_SENDER',message:'Request denied',requestId};
  if (/^Operation timed out\./.test(message))
    return {code:'TIMEOUT',message:'Operation timed out. Check its result before retrying.',requestId};
  if (/^(?:Please sign in|Change your temporary password first|Your role does not allow|Only an admin can)/.test(message))
    return {code:'ACCESS_DENIED',message,requestId};
  if (/SQLITE|database is locked|no such table|\b(?:select|insert|update|delete)\s+.+\b(?:from|into|set)\b|[A-Za-z]:\\|\\\\|\/Users\/|\/home\//i.test(message) || message.length>300)
    return {code:'INTERNAL',message:'Operation failed. Please retry or contact support.',requestId};
  return {code:'BUSINESS_RULE',message,requestId};
}

module.exports={publicError};
