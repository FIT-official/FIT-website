export function bulkEmailCopy(status) {
  if (status === 'accepted') return 'The owner email alert was accepted by the mail provider. Inbox delivery is not yet confirmed.'
  if (status === 'pending' || status === 'sending') return 'The owner email alert is pending. Your enquiry is saved in the owner dashboard.'
  if (status === 'failed') return 'The owner email alert failed. Your enquiry is saved in the owner dashboard; please do not submit it again.'
  if (status === 'uncertain') return 'The owner email alert outcome is unconfirmed. Your enquiry is saved in the owner dashboard; please do not submit it again.'
  return 'The owner email alert is unavailable. Your enquiry is saved in the owner dashboard.'
}
