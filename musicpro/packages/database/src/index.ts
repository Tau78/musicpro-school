export {
  ensureMemberLinked,
  getCurrentMember,
  getCurrentMemberWithRoles,
  getMemberRoles,
  getSession,
} from "./auth";
export {
  grantMemberRole,
  listMemberIdsWithRole,
  listMemberLabelsWithRole,
  revokeMemberRole,
  setMemberHasRole,
} from "./member-roles";
export type { RoleMutationResult } from "./member-roles";
export { createBrowserClient } from "./browser";
export { createServerClient } from "./server";
export { createMobileClient } from "./mobile";
export { getSupabaseAnonKey, getSupabaseUrl } from "./env";
export type { Database, MemberRoleEnum } from "./types/database";
export {
  BOOKING_TIMEZONE,
  SLOT_CLOSE_HOUR,
  SLOT_DURATION_MINUTES,
  SLOT_OPEN_HOUR,
  bookingStatusLabel,
  bookingPaymentMethodLabel,
  calculateBookingPrice,
  canCancelBooking,
  cancelBooking,
  createBooking,
  durationOptionsForRoom,
  formatBookingDateTime,
  formatCreditsCount,
  formatDateItalian,
  formatDurationLabel,
  getBookingSettings,
  getLeadTimeCategory,
  getRoomAvailability,
  fetchRoomAvailability,
  buildRoomAvailability,
  getRomeDayBoundsUtc,
  getRoomById,
  getRomeDayOfWeek,
  getRomeMinutesFromMidnight,
  isSlotInProviSchedule,
  minutesToTimeLabel,
  closeMinuteHint,
  closeMinuteToTimeInput,
  formatRoomHoursLabel,
  proviDayLabel,
  roomCloseMinute,
  roomOpenMinute,
  timeInputToCloseMinute,
  timeLabelToMinutes,
  bookingNeedsPayment,
  requestBookingCreditsPayment,
  requestRoomBookingPaymentUrl,
  adminUpdateBooking,
  bookingAuditActionLabel,
  countPendingApprovalBookings,
  getAdminBookingById,
  listAdminBookings,
  listBookingAuditLog,
  listMyBookings,
  listBookableBands,
  listRooms,
  reviewBooking,
  romeLocalInputToUtcIso,
  settlementMethodLabel,
  subscribeToBookings,
  todayInRome,
  utcIsoToRomeLocalInput,
} from "./bookings";
export {
  createCancellationPenaltyRule,
  deleteCancellationPenaltyRule,
  listCancellationPenaltyRules,
  updateCancellationPenaltyRule,
} from "./penalties";
export type {
  CancellationPenaltyRule,
  CancellationPenaltyRuleInput,
  PenaltyMutationResult,
} from "./penalties";
export {
  DOCUMENT_SETTING_KEYS,
  DOCUMENT_SETTING_LABELS,
  getAppBookingSettings,
  listAppSettings,
  listDocumentSettings,
  updateBookingSettings,
  upsertAppSetting,
  upsertDocumentSettings,
} from "./settings";
export type {
  AppSetting,
  BookingSettingsInput,
  DocumentSettingKey,
  SettingsMutationResult,
} from "./settings";
export {
  createRoomExternalCalendar,
  deleteRoomExternalCalendar,
  listRoomExternalCalendars,
  requestExternalCalendarSync,
  updateRoomExternalCalendar,
} from "./external-calendars";
export type {
  ExternalCalendarMutationResult,
  RoomExternalCalendar,
  RoomExternalCalendarInput,
} from "./external-calendars";
export {
  getAdminRoomById,
  listAllRooms,
  listProviSchedule,
  roomToInput,
  saveProviSchedule,
  updateRoom,
} from "./rooms";
export type { RoomInput, RoomMutationResult } from "./rooms";
export type {
  AdminBookingDetail,
  AdminBookingFilter,
  AdminBookingListItem,
  AdminBookingUpdateInput,
  AdminBookingUpdateResult,
  Booking,
  BookingAuditLogEntry,
  BookingChangePayload,
  BookingErrorCode,
  BookingMemberSnapshotEntry,
  BookingPaymentStatus,
  BookingPaymentMethod,
  BookingPriceOptions,
  BookingSettings,
  BookingStatus,
  BookingWithRoom,
  CancelBookingResult,
  CreateBookingResult,
  LeadTimeCategory,
  ReviewBookingResult,
  ProviScheduleEntry,
  Room,
  RoomAvailability,
  SettlementMethod,
  BusyInterval,
  TimeSlot,
} from "./bookings";
export {
  createMember,
  deleteMember,
  getMemberById,
  getNextMemberNumber,
  listMembers,
  listMembersDetail,
  updateMember,
} from "./members";
export {
  findDuplicateMembers,
  mergeDuplicateMembers,
} from "./members-merge";
export type {
  DuplicateFieldConflict,
  DuplicateMemberSummary,
  DuplicateMergePlan,
  MergeMembersResult,
} from "./members-merge";
export {
  adminAdjustMemberCredits,
  createCreditPackage,
  creditsForBookingDuration,
  debitBookingCredits,
  deleteCreditPackage,
  getCreditPackageById,
  getMemberCreditBalance,
  holdBookingCredits,
  listMemberAvailableCredits,
  listActiveCreditPackages,
  listCreditPackages,
  listMemberCreditPurchases,
  listMemberCreditTransactions,
  updateCreditPackage,
} from "./credits";
export type {
  AdminAdjustCreditsResult,
  BookingCreditsPaymentResult,
  CreditMutationResult,
  CreditPackage,
  CreditPackageInput,
  CreditPurchase,
  CreditTransaction,
  CreditTransactionType,
  MemberCreditBalance,
} from "./credits";
export type {
  MemberDetail,
  MemberInput,
  MemberMutationResult,
  MemberSummary,
} from "./members";
export {
  createMessageTemplate,
  deleteMessageTemplate,
  getMessageTemplateById,
  listMessageTemplates,
  updateMessageTemplate,
} from "./templates";
export type {
  MessageTemplate,
  MessageTemplateChannel,
  MessageTemplateInput,
  TemplateMutationResult,
} from "./templates";
export {
  applyMessagePlaceholders,
  sendBulkMessages,
  sendLessonFamilyEmail,
  sendSingleEmail,
} from "./messaging";
export type {
  EmailAttachment,
  MessageChannel,
  PlaceholderContext,
  SendBulkMessageInput,
  SendBulkMessageResult,
  SendSingleEmailInput,
  SendSingleEmailResult,
} from "./messaging";
export {
  acceptBandInvite,
  bandMemberRoleLabel,
  bandMemberStatusLabel,
  createBand,
  createBandInvite,
  getBand,
  getBandInviteByToken,
  leaveBand,
  listBandMembers,
  listMyBands,
} from "./bands";
export type {
  AcceptBandInviteResult,
  Band,
  BandErrorCode,
  BandInvite,
  BandInvitePreview,
  BandInviteStatus,
  BandMember,
  BandMemberRole,
  BandMemberStatus,
  BandMutationResult,
  CreateBandInviteResult,
  LeaveBandResult,
  MyBandSummary,
  QuotaPayment,
  QuotaPaymentItem,
  QuotaPaymentItemStatus,
} from "./bands";
export {
  createAnnualQuotaSetting,
  currentFiscalYear,
  deleteAnnualQuotaSetting,
  formatQuotaDateItalian,
  formatQuotaEuro,
  listAnnualQuotaSettings,
  listMemberAnnualQuotas,
  updateAnnualQuotaSetting,
  upsertMemberAnnualQuotas,
} from "./quotas";
export {
  createQuotaPaymentCheckout,
  listQuotaPaymentItems,
} from "./quota-payments";
export type { CreateQuotaPaymentCheckoutResult } from "./quota-payments";
export type {
  AnnualQuotaSetting,
  AnnualQuotaSettingInput,
  BulkQuotaUpsertResult,
  MemberAnnualQuota,
  MemberAnnualQuotaInput,
  QuotaMutationResult,
} from "./quotas";
export {
  DEFAULT_PAYMENT_METHODS,
  RECEIPTS_STATUS_LABELS,
  buildReceiptsNote,
  deleteReimbursement,
  deleteReimbursements,
  ensureReceiptsNotes,
  formatDateItalian as formatReimbursementDateItalian,
  formatEuro,
  formatPaymentAmountIt,
  formatPaymentMethodString,
  generateReimbursement,
  generateReimbursementsBatch,
  getMemberReceiptsBalance,
  getNextProgressive,
  getReimbursementById,
  isExternalPdfUrl,
  listReimbursements,
  paymentPartsMatchGross,
  signReimbursement,
  sumPaymentParts,
  updateReceiptsAmount,
  updateReimbursementPdf,
} from "./reimbursements";
export type {
  GenerateBatchResult,
  GenerateReimbursementInput,
  MemberReceiptsBalance,
  PaymentPart,
  ReceiptsStatus,
  ReimbursementDisplay,
  ReimbursementListResult,
  ReimbursementMutationResult,
} from "./reimbursements";
export {
  getLessonSchoolSettings,
  updateLessonSchoolSettings,
  listSchoolCourseTerms,
  getCurrentSchoolCourseTerm,
  upsertSchoolCourseTerm,
  setCurrentSchoolCourseTerm,
  listLessonSubjects,
  listSchoolClosures,
  createSchoolClosure,
  deleteSchoolClosure,
  listCoursePackPrices,
  updateCoursePackPrice,
  listPayRateTypes,
  createPayRateType,
  getTeacherProfile,
  listTeacherPayRates,
  listTeacherSubjects,
  upsertTeacherProfile,
  setTeacherPayRate,
  setTeacherSubjects,
} from "./lessons-settings";
export type {
  CourseKind,
  CoursePackPrice,
  CreatePayRateTypeInput,
  CreateSchoolClosureInput,
  IsoWeekday,
  LessonSchoolSettings,
  LessonSchoolSettingsPatch,
  LessonSettingsMutationResult,
  LessonSubject,
  SchoolCourseTerm,
  SchoolCourseTermInput,
  PayRateType,
  PayRateUnit,
  PaymentVisibility,
  SchoolClosure,
  TeacherPayRate,
  TeacherProfile,
  TeacherProfilePatch,
  TeacherSubject,
} from "./lessons-settings";
export {
  approveCourse,
  createCourse,
  expireDueHolds,
  extendCourseHold,
  generateCourseLessons,
  getCourse,
  listCourses,
  listPendingCourses,
  listUnplacedLessons,
  placeLesson,
  rejectCourse,
  transferCourseTitular,
} from "./courses";
export type {
  Course,
  CourseDetail,
  CourseDurationMinutes,
  CourseEnrollment,
  CourseEnrollmentWithMember,
  CourseMutationResult,
  CourseStatus,
  CourseTeacher,
  CourseTeacherRole,
  CourseTitular,
  CreateCourseActor,
  CreateCourseInput,
  LessonScheduleActor,
  Lesson,
  LessonKind,
  LessonParkedReason,
  LessonPlacement,
  ListCoursesOptions,
} from "./courses";
export {
  listPendingLessonChangeRequests,
  reviewLessonChangeRequest,
} from "./lesson-change-requests";
export type { LessonChangeRequest } from "./lesson-change-requests";
export {
  cancelLessonAsSchool,
  getLessonRoster,
  listRecoverableLessons,
  markTeacherAbsent,
  parkScheduledLesson,
  saveLessonAttendance,
  unlockLessonAttendance,
} from "./lessons-attendance";
export type {
  AttendanceStatus,
  LessonRoster,
  LessonRosterStudent,
} from "./lessons-attendance";
export {
  adjustEnrollmentCredits,
  ensureOpenPackFee,
  getEnrollmentWallet,
  listEnrollmentWalletsForCourse,
  listLessonFees,
  maybeSendPackReminders,
  registerFamilyCollection,
  seedOpeningPrepaidCredits,
  sendFeeDunning,
  waiveLessonFee,
} from "./lessons-wallet";
export type {
  EnrollmentWallet,
  LessonCreditKind,
  LessonFeeKind,
  LessonFeeRow,
  LessonFeeStatus,
} from "./lessons-wallet";
export {
  confirmTeacherCashAdvance,
  listTeacherCashAdvances,
  registerTeacherCashCollection,
  rejectTeacherCashAdvance,
} from "./lessons-cash";
export type { TeacherCashAdvanceRow } from "./lessons-cash";
export {
  emailFiscalReceiptCopy,
  emitFiscalReceiptForPayment,
  fiscalReceiptsCsv,
  getFiscalReceipt,
  listFiscalReceipts,
  markFiscalReceiptEmailed,
  replaceFiscalReceipt,
} from "./lessons-receipts";
export type { FiscalReceiptRow } from "./lessons-receipts";
export {
  notifyCourseApproved,
  notifyLessonScheduleChange,
  notifyPackPaymentLink,
  sendDueLessonReminders,
} from "./lessons-notify";
export type { LessonScheduleNotifyKind } from "./lessons-notify";
export {
  addLessonPayrollExtra,
  addMonths,
  closeLessonPayroll,
  generateDueLessonPayrollDrafts,
  generateLessonPayroll,
  getLessonPayroll,
  isPayrollMonthClosed,
  listLessonPayrolls,
  markLessonPayrollPaid,
  previewLessonPayroll,
  requestLessonPayrollDraft,
  setLessonPayrollWithholding,
  signLessonPayroll,
  unlockLessonPayroll,
  yearMonthFromRomeDate,
} from "./lessons-payroll";
export type {
  LessonPayroll,
  LessonPayrollLine,
  LessonPayrollLineKind,
  LessonPayrollStatus,
  PayrollPreview,
} from "./lessons-payroll";
export {
  cancelTrial,
  convertTrialToCourse,
  createTrial,
  listTrialCourses,
  rescheduleTrial,
  sendTrialWelcomeEmail,
} from "./lessons-trials";
export type { CreateTrialActor, CreateTrialInput } from "./lessons-trials";
export {
  listLessonsInRange,
  listLessonsOnDate,
  moveLesson,
  requestLessonMove,
} from "./lessons-calendar";
export type {
  CalendarLesson,
  ListLessonsCalendarOptions,
  ListLessonsInRangeInput,
  MoveLessonInput,
  RequestLessonMoveInput,
} from "./lessons-calendar";
export {
  availabilityConflictsWithLessons,
  createTeacherTimeOff,
  deleteTeacherTimeOff,
  listTeacherAvailability,
  listTeacherTimeOff,
  replaceTeacherAvailability,
  updateTeacherTimeOff,
} from "./teacher-availability";
export type {
  CreateTeacherTimeOffInput,
  TeacherAvailabilityMutationResult,
  LessonAvailabilityConflict,
  TeacherAvailabilitySlot,
  TeacherAvailabilitySlotInput,
  TeacherTimeOff,
  TeacherTimeOffPatch,
} from "./teacher-availability";
