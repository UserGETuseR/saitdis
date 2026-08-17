-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "bookingCapacity" INTEGER NOT NULL DEFAULT 3,
    "workingHours" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "login" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "telegramUserId" TEXT,
    "passwordHash" TEXT,
    "passwordUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthOtpChallenge" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'CLIENT',
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLoginRequest" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "mode" TEXT NOT NULL DEFAULT 'CLIENT',
    "staffInviteId" TEXT,
    "targetUserId" TEXT,
    "telegramUserId" TEXT,
    "chatId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLoginRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdminChat" (
    "id" TEXT NOT NULL,
    "singletonKey" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAdminChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminEnrollment" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "telegramUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramRequest" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramPaymentProof" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "consultationId" TEXT,
    "appointmentId" TEXT,
    "telegramUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sourceMessageId" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedByChatId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramPaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "StaffMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "telegramUserId" TEXT,
    "preferredChannel" TEXT NOT NULL DEFAULT 'TELEGRAM',
    "address" TEXT,
    "emergencyContact" TEXT,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT,
    "utm" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdIdempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pet" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT,
    "sex" TEXT,
    "neuterState" TEXT,
    "birthDate" TIMESTAMP(3),
    "color" TEXT,
    "microchip" TEXT,
    "passportId" TEXT,
    "lifecycle" TEXT NOT NULL DEFAULT 'ACTIVE',
    "medicalAlerts" JSONB,
    "chronicConditions" JSONB NOT NULL DEFAULT '[]',
    "behavioralAlerts" JSONB NOT NULL DEFAULT '[]',
    "feedingNotes" TEXT,
    "medicationNotes" TEXT,
    "vaccinationDueAt" TIMESTAMP(3),
    "primaryVeterinarianId" TEXT,
    "createdIdempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerPetRelation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL DEFAULT '["VIEW","BOOK"]',
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "OwnerPetRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetFile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT,
    "petId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "uploadedBy" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "PetFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetMemoryNode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "facts" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetMemoryNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetMemoryEdge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetMemoryEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "publicName" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "onlineBookable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceVariant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "priceMinor" INTEGER NOT NULL,
    "depositMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "allowedSpecies" JSONB NOT NULL,

    CONSTRAINT "ServiceVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL,
    "previousStartsAt" TIMESTAMP(3),
    "previousEndsAt" TIMESTAMP(3),
    "rescheduledAt" TIMESTAMP(3),
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "noShowAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentStatusEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "visibleToOwner" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingHold" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingWaitlistEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "preferredDate" TIMESTAMP(3) NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'ANY',
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "offeredHoldId" TEXT,
    "offeredAt" TIMESTAMP(3),
    "offerExpiresAt" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingWaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingReminder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'TELEGRAM',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "preferredChannel" TEXT NOT NULL DEFAULT 'TELEGRAM',
    "state" TEXT NOT NULL DEFAULT 'WAITING_PAYMENT',
    "paymentState" TEXT NOT NULL DEFAULT 'AWAITING_PROOF',
    "paymentTokenHash" TEXT NOT NULL,
    "paymentTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "telegramUserId" TEXT,
    "telegramChatId" TEXT,
    "staffId" TEXT,
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "state" TEXT NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineType" TEXT NOT NULL,
    "referenceId" TEXT,
    "description" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "unitPriceMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "taxCode" TEXT,
    "performerId" TEXT,
    "costBasisMinor" INTEGER,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'MANUAL',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT,
    "receiptType" TEXT NOT NULL DEFAULT 'PAYMENT',
    "state" TEXT NOT NULL DEFAULT 'PENDING_PROVIDER',
    "provider" TEXT,
    "externalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "petId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL,
    "complaint" TEXT,
    "history" JSONB NOT NULL DEFAULT '{}',
    "vitals" JSONB NOT NULL DEFAULT '{}',
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "dischargeSummary" TEXT,
    "clinicianId" TEXT NOT NULL,
    "signedBy" TEXT,
    "signatureHash" TEXT,
    "lockedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "amendmentOfId" TEXT,
    "revisionReason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterDiagnosis" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "code" TEXT,
    "display" TEXT NOT NULL,
    "diagnosisType" TEXT NOT NULL DEFAULT 'WORKING',
    "certainty" TEXT NOT NULL DEFAULT 'SUSPECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterProcedure" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "code" TEXT,
    "display" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "unitPriceMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "prescriberId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "reactions" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT,
    "documentId" TEXT,
    "appointmentId" TEXT,
    "caseId" TEXT,
    "documentVersion" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "signerName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "proofMetadata" JSONB,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanTask" (
    "id" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "state" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CarePlanTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareRecommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "triggerNodeId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "expectedOutcome" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "state" TEXT NOT NULL DEFAULT 'PROPOSED',
    "assignedRole" TEXT,
    "dueAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "coatType" TEXT,
    "sensitivities" TEXT,
    "behaviorNotes" TEXT,
    "preferredStyle" TEXT,
    "medicalRestrictions" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroomingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingRecipe" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "notes" TEXT,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroomingRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingVisit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "recipeId" TEXT,
    "state" TEXT NOT NULL,
    "currentStage" TEXT NOT NULL DEFAULT 'INTAKE',
    "stageStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageLog" JSONB NOT NULL DEFAULT '[]',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "report" TEXT,
    "homeCare" JSONB NOT NULL DEFAULT '[]',
    "nextCareAt" TIMESTAMP(3),
    "beforeFileIds" JSONB NOT NULL DEFAULT '[]',
    "afterFileIds" JSONB NOT NULL DEFAULT '[]',
    "startedBy" TEXT NOT NULL,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroomingVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingObservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "groomingVisitId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "state" TEXT NOT NULL DEFAULT 'NEW',
    "observedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "linkedMemoryNodeId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroomingObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassportShare" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassportShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "credits" INTEGER NOT NULL,
    "priceMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "validityDays" INTEGER NOT NULL DEFAULT 365,
    "familyShared" BOOLEAN NOT NULL DEFAULT false,
    "benefits" JSONB NOT NULL DEFAULT '{}',
    "state" TEXT NOT NULL,
    "serviceIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageBalance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT,
    "packageId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "initialCredits" INTEGER NOT NULL DEFAULT 0,
    "remainingCredits" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,

    CONSTRAINT "PackageBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "creditsUsed" INTEGER NOT NULL DEFAULT 1,
    "usedBy" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pointsPer100Rubles" INTEGER NOT NULL DEFAULT 1,
    "rublesPerPoint" INTEGER NOT NULL DEFAULT 1,
    "tiers" JSONB NOT NULL DEFAULT '[]',
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyLedgerEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "billingPeriodDays" INTEGER NOT NULL DEFAULT 30,
    "benefits" JSONB NOT NULL DEFAULT '{}',
    "serviceLimits" JSONB NOT NULL DEFAULT '{}',
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "renewsAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'GENERAL',
    "priority" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "assigneeId" TEXT,
    "ownerId" TEXT,
    "petId" TEXT,
    "dueAt" TIMESTAMP(3),
    "details" TEXT,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OperationalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'LOGGED',
    "staffId" TEXT,
    "externalMessageId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT,
    "subject" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedRole" TEXT,
    "assigneeId" TEXT,
    "slaDueAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "followUpAt" TIMESTAMP(3),
    "externalKey" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorId" TEXT,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "externalMessageId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "petId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospitalization" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "bedId" TEXT,
    "responsibleClinicianId" TEXT,
    "acuity" TEXT NOT NULL DEFAULT 'STABLE',
    "currentPlan" TEXT,
    "ownerUpdateState" TEXT NOT NULL DEFAULT 'DUE',
    "alerts" JSONB NOT NULL DEFAULT '[]',
    "state" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),
    "dischargedBy" TEXT,
    "dischargeSummary" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hospitalization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalBed" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "cleaningState" TEXT NOT NULL DEFAULT 'READY',
    "isolation" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentTask" (
    "id" TEXT NOT NULL,
    "hospitalizationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "taskType" TEXT NOT NULL DEFAULT 'TREATMENT',
    "instructions" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL,
    "assignedStaffId" TEXT,
    "administeredBy" TEXT,
    "administeredAt" TIMESTAMP(3),
    "missedReason" TEXT,
    "notes" TEXT,
    "vitals" JSONB,

    CONSTRAINT "TreatmentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalObservation" (
    "id" TEXT NOT NULL,
    "hospitalizationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "acuity" TEXT NOT NULL,
    "vitals" JSONB NOT NULL,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalHandoff" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "unresolved" JSONB NOT NULL DEFAULT '[]',
    "state" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgicalCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "procedure" TEXT NOT NULL,
    "indication" TEXT NOT NULL,
    "surgeonId" TEXT NOT NULL,
    "teamIds" JSONB NOT NULL,
    "room" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL,
    "consentRecorded" BOOLEAN NOT NULL DEFAULT false,
    "fastingConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "checklist" JSONB NOT NULL,
    "operativeNote" TEXT,
    "complicationNote" TEXT,
    "recoveryNote" TEXT,
    "dischargedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurgicalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnesthesiaRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "surgicalCaseId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "responsibleStaffId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "preAssessment" TEXT,
    "protocol" TEXT,
    "airway" TEXT,
    "medications" JSONB NOT NULL,
    "vitals" JSONB NOT NULL,
    "events" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AnesthesiaRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DentalChart" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "procedures" JSONB NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),
    "amendmentOfId" TEXT,

    CONSTRAINT "DentalChart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "serialNumber" TEXT,
    "state" TEXT NOT NULL,
    "lastMaintenanceAt" TIMESTAMP(3),
    "maintenanceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalIdentity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "opaqueToken" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PhysicalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultSummary" TEXT,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specimen" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "container" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "collectedBy" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "externalReference" TEXT,
    "receivedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "resultLinkedAt" TIMESTAMP(3),
    "identityId" TEXT NOT NULL,

    CONSTRAINT "Specimen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "orderedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "barcode" TEXT,
    "purchasePriceMinor" INTEGER,
    "sellPriceMinor" INTEGER,
    "lowStockThresholdMilli" INTEGER NOT NULL DEFAULT 0,
    "storageRequirements" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "expiryAt" TIMESTAMP(3),
    "quantityMilli" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "storageState" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL,
    "balanceAfterMilli" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "petId" TEXT,
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "contentHash" TEXT,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "PrintTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT,
    "appointmentId" TEXT,
    "caseId" TEXT,
    "invoiceId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "renderedBody" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "state" TEXT NOT NULL DEFAULT 'AWAITING_SIGNATURE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalJobId" TEXT,
    "failureReason" TEXT,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "signedOffBy" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employmentState" TEXT NOT NULL,
    "specialties" JSONB NOT NULL,
    "locationIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "competency" TEXT NOT NULL,
    "certificateNumber" TEXT,
    "expiresAt" TIMESTAMP(3),
    "permittedProcedureCodes" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Precheck" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "ownerNote" TEXT,
    "arrivalConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Precheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_organizationId_idx" ON "Location"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_login_key" ON "UserIdentity"("login");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_phone_key" ON "UserIdentity"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_email_key" ON "UserIdentity"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_telegramUserId_key" ON "UserIdentity"("telegramUserId");

-- CreateIndex
CREATE INDEX "AuthOtpChallenge_identity_state_expiresAt_idx" ON "AuthOtpChallenge"("identity", "state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_state_expiresAt_idx" ON "AuthSession"("userId", "state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLoginRequest_tokenHash_key" ON "TelegramLoginRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "TelegramLoginRequest_state_expiresAt_idx" ON "TelegramLoginRequest"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "TelegramLoginRequest_telegramUserId_idx" ON "TelegramLoginRequest"("telegramUserId");

-- CreateIndex
CREATE INDEX "TelegramLoginRequest_staffInviteId_state_idx" ON "TelegramLoginRequest"("staffInviteId", "state");

-- CreateIndex
CREATE INDEX "TelegramLoginRequest_targetUserId_state_idx" ON "TelegramLoginRequest"("targetUserId", "state");

-- CreateIndex
CREATE INDEX "TelegramConversation_organizationId_state_expiresAt_idx" ON "TelegramConversation"("organizationId", "state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConversation_organizationId_telegramUserId_key" ON "TelegramConversation"("organizationId", "telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvite_tokenHash_key" ON "StaffInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffInvite_organizationId_state_expiresAt_idx" ON "StaffInvite"("organizationId", "state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdminChat_singletonKey_key" ON "TelegramAdminChat"("singletonKey");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdminChat_chatId_key" ON "TelegramAdminChat"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdminChat_telegramUserId_key" ON "TelegramAdminChat"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminEnrollment_tokenHash_key" ON "AdminEnrollment"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminEnrollment_state_expiresAt_idx" ON "AdminEnrollment"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "TelegramRequest_telegramUserId_state_createdAt_idx" ON "TelegramRequest"("telegramUserId", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPaymentProof_requestId_key" ON "TelegramPaymentProof"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPaymentProof_consultationId_key" ON "TelegramPaymentProof"("consultationId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPaymentProof_appointmentId_key" ON "TelegramPaymentProof"("appointmentId");

-- CreateIndex
CREATE INDEX "TelegramPaymentProof_state_createdAt_idx" ON "TelegramPaymentProof"("state", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramPaymentProof_telegramUserId_chatId_idx" ON "TelegramPaymentProof"("telegramUserId", "chatId");

-- CreateIndex
CREATE INDEX "StaffMembership_organizationId_role_idx" ON "StaffMembership"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMembership_organizationId_userId_key" ON "StaffMembership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_createdIdempotencyKey_key" ON "Owner"("createdIdempotencyKey");

-- CreateIndex
CREATE INDEX "Owner_organizationId_phone_idx" ON "Owner"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_organizationId_telegramUserId_key" ON "Owner"("organizationId", "telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_organizationId_userId_key" ON "Owner"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Pet_createdIdempotencyKey_key" ON "Pet"("createdIdempotencyKey");

-- CreateIndex
CREATE INDEX "Pet_organizationId_name_idx" ON "Pet"("organizationId", "name");

-- CreateIndex
CREATE INDEX "OwnerPetRelation_organizationId_petId_state_idx" ON "OwnerPetRelation"("organizationId", "petId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerPetRelation_organizationId_ownerId_petId_key" ON "OwnerPetRelation"("organizationId", "ownerId", "petId");

-- CreateIndex
CREATE UNIQUE INDEX "PetFile_storageKey_key" ON "PetFile"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "PetFile_idempotencyKey_key" ON "PetFile"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PetFile_organizationId_petId_state_createdAt_idx" ON "PetFile"("organizationId", "petId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "PetMemoryNode_organizationId_petId_occurredAt_idx" ON "PetMemoryNode"("organizationId", "petId", "occurredAt");

-- CreateIndex
CREATE INDEX "PetMemoryNode_organizationId_petId_type_severity_idx" ON "PetMemoryNode"("organizationId", "petId", "type", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "PetMemoryNode_organizationId_sourceType_sourceId_type_key" ON "PetMemoryNode"("organizationId", "sourceType", "sourceId", "type");

-- CreateIndex
CREATE INDEX "PetMemoryEdge_organizationId_petId_createdAt_idx" ON "PetMemoryEdge"("organizationId", "petId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PetMemoryEdge_organizationId_fromNodeId_toNodeId_relation_key" ON "PetMemoryEdge"("organizationId", "fromNodeId", "toNodeId", "relation");

-- CreateIndex
CREATE INDEX "Service_organizationId_kind_idx" ON "Service"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "ServiceVariant_organizationId_serviceId_idx" ON "ServiceVariant"("organizationId", "serviceId");

-- CreateIndex
CREATE INDEX "Appointment_organizationId_staffId_startsAt_idx" ON "Appointment"("organizationId", "staffId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_organizationId_petId_startsAt_idx" ON "Appointment"("organizationId", "petId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentStatusEvent_idempotencyKey_key" ON "AppointmentStatusEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AppointmentStatusEvent_organizationId_appointmentId_created_idx" ON "AppointmentStatusEvent"("organizationId", "appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AppointmentStatusEvent_organizationId_petId_createdAt_idx" ON "AppointmentStatusEvent"("organizationId", "petId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingHold_organizationId_locationId_state_startsAt_endsAt_idx" ON "BookingHold"("organizationId", "locationId", "state", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "BookingHold_organizationId_ownerId_state_expiresAt_idx" ON "BookingHold"("organizationId", "ownerId", "state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingHold_organizationId_idempotencyKey_key" ON "BookingHold"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BookingWaitlistEntry_organizationId_locationId_variantId_pr_idx" ON "BookingWaitlistEntry"("organizationId", "locationId", "variantId", "preferredDate", "state");

-- CreateIndex
CREATE INDEX "BookingWaitlistEntry_organizationId_ownerId_state_createdAt_idx" ON "BookingWaitlistEntry"("organizationId", "ownerId", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingWaitlistEntry_organizationId_idempotencyKey_key" ON "BookingWaitlistEntry"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BookingReminder_organizationId_state_scheduledAt_idx" ON "BookingReminder"("organizationId", "state", "scheduledAt");

-- CreateIndex
CREATE INDEX "BookingReminder_organizationId_ownerId_createdAt_idx" ON "BookingReminder"("organizationId", "ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingReminder_appointmentId_kind_key" ON "BookingReminder"("appointmentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_appointmentId_key" ON "Consultation"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_paymentTokenHash_key" ON "Consultation"("paymentTokenHash");

-- CreateIndex
CREATE INDEX "Consultation_organizationId_ownerId_state_createdAt_idx" ON "Consultation"("organizationId", "ownerId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "Consultation_organizationId_petId_createdAt_idx" ON "Consultation"("organizationId", "petId", "createdAt");

-- CreateIndex
CREATE INDEX "Consultation_organizationId_paymentState_createdAt_idx" ON "Consultation"("organizationId", "paymentState", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_appointmentId_key" ON "Invoice"("appointmentId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_ownerId_idx" ON "Invoice"("organizationId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_idempotencyKey_key" ON "InvoiceLine"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InvoiceLine_organizationId_invoiceId_createdAt_idx" ON "InvoiceLine"("organizationId", "invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceLine_organizationId_referenceId_idx" ON "InvoiceLine"("organizationId", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_provider_providerTransactionId_key" ON "Payment"("organizationId", "provider", "providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalReceipt_idempotencyKey_key" ON "FiscalReceipt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FiscalReceipt_organizationId_state_createdAt_idx" ON "FiscalReceipt"("organizationId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "FiscalReceipt_organizationId_invoiceId_idx" ON "FiscalReceipt"("organizationId", "invoiceId");

-- CreateIndex
CREATE INDEX "ClinicalCase_organizationId_petId_openedAt_idx" ON "ClinicalCase"("organizationId", "petId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_appointmentId_key" ON "Encounter"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_idempotencyKey_key" ON "Encounter"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Encounter_organizationId_petId_idx" ON "Encounter"("organizationId", "petId");

-- CreateIndex
CREATE INDEX "Encounter_organizationId_state_updatedAt_idx" ON "Encounter"("organizationId", "state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_caseId_version_key" ON "Encounter"("caseId", "version");

-- CreateIndex
CREATE INDEX "EncounterDiagnosis_organizationId_encounterId_idx" ON "EncounterDiagnosis"("organizationId", "encounterId");

-- CreateIndex
CREATE INDEX "EncounterDiagnosis_organizationId_code_idx" ON "EncounterDiagnosis"("organizationId", "code");

-- CreateIndex
CREATE INDEX "EncounterProcedure_organizationId_encounterId_idx" ON "EncounterProcedure"("organizationId", "encounterId");

-- CreateIndex
CREATE INDEX "Prescription_organizationId_encounterId_idx" ON "Prescription"("organizationId", "encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "Consent_documentId_key" ON "Consent"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Consent_idempotencyKey_key" ON "Consent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Consent_organizationId_ownerId_idx" ON "Consent"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "Consent_organizationId_petId_purpose_idx" ON "Consent"("organizationId", "petId", "purpose");

-- CreateIndex
CREATE INDEX "CarePlan_organizationId_petId_idx" ON "CarePlan"("organizationId", "petId");

-- CreateIndex
CREATE INDEX "CarePlanTask_organizationId_dueAt_state_idx" ON "CarePlanTask"("organizationId", "dueAt", "state");

-- CreateIndex
CREATE UNIQUE INDEX "CareRecommendation_idempotencyKey_key" ON "CareRecommendation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CareRecommendation_organizationId_petId_state_dueAt_idx" ON "CareRecommendation"("organizationId", "petId", "state", "dueAt");

-- CreateIndex
CREATE INDEX "CareRecommendation_organizationId_ownerId_state_priority_idx" ON "CareRecommendation"("organizationId", "ownerId", "state", "priority");

-- CreateIndex
CREATE INDEX "GroomingProfile_organizationId_petId_idx" ON "GroomingProfile"("organizationId", "petId");

-- CreateIndex
CREATE UNIQUE INDEX "GroomingProfile_organizationId_petId_key" ON "GroomingProfile"("organizationId", "petId");

-- CreateIndex
CREATE INDEX "GroomingRecipe_organizationId_petId_isPreferred_idx" ON "GroomingRecipe"("organizationId", "petId", "isPreferred");

-- CreateIndex
CREATE UNIQUE INDEX "GroomingVisit_appointmentId_key" ON "GroomingVisit"("appointmentId");

-- CreateIndex
CREATE INDEX "GroomingVisit_organizationId_petId_state_idx" ON "GroomingVisit"("organizationId", "petId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "GroomingObservation_idempotencyKey_key" ON "GroomingObservation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GroomingObservation_organizationId_petId_state_createdAt_idx" ON "GroomingObservation"("organizationId", "petId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "GroomingObservation_organizationId_appointmentId_createdAt_idx" ON "GroomingObservation"("organizationId", "appointmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PassportShare_token_key" ON "PassportShare"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PassportShare_idempotencyKey_key" ON "PassportShare"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PassportShare_organizationId_petId_state_idx" ON "PassportShare"("organizationId", "petId", "state");

-- CreateIndex
CREATE INDEX "PrivacyRequest_organizationId_ownerId_state_idx" ON "PrivacyRequest"("organizationId", "ownerId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_organizationId_slug_key" ON "KnowledgeArticle"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ServicePackage_organizationId_state_idx" ON "ServicePackage"("organizationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "PackageBalance_idempotencyKey_key" ON "PackageBalance"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PackageBalance_organizationId_ownerId_idx" ON "PackageBalance"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "PackageBalance_organizationId_state_expiresAt_idx" ON "PackageBalance"("organizationId", "state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PackageUsage_appointmentId_key" ON "PackageUsage"("appointmentId");

-- CreateIndex
CREATE INDEX "PackageUsage_organizationId_balanceId_usedAt_idx" ON "PackageUsage"("organizationId", "balanceId", "usedAt");

-- CreateIndex
CREATE INDEX "LoyaltyPolicy_organizationId_state_effectiveAt_idx" ON "LoyaltyPolicy"("organizationId", "state", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyPolicy_organizationId_version_key" ON "LoyaltyPolicy"("organizationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyLedgerEntry_idempotencyKey_key" ON "LoyaltyLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LoyaltyLedgerEntry_organizationId_ownerId_createdAt_idx" ON "LoyaltyLedgerEntry"("organizationId", "ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyLedgerEntry_organizationId_referenceType_referenceId_idx" ON "LoyaltyLedgerEntry"("organizationId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "MembershipPlan_organizationId_state_idx" ON "MembershipPlan"("organizationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerMembership_idempotencyKey_key" ON "OwnerMembership"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OwnerMembership_organizationId_ownerId_state_idx" ON "OwnerMembership"("organizationId", "ownerId", "state");

-- CreateIndex
CREATE INDEX "OwnerMembership_organizationId_renewsAt_state_idx" ON "OwnerMembership"("organizationId", "renewsAt", "state");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalTask_idempotencyKey_key" ON "OperationalTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OperationalTask_organizationId_state_priority_idx" ON "OperationalTask"("organizationId", "state", "priority");

-- CreateIndex
CREATE INDEX "OperationalTask_organizationId_ownerId_state_dueAt_idx" ON "OperationalTask"("organizationId", "ownerId", "state", "dueAt");

-- CreateIndex
CREATE INDEX "OperationalTask_organizationId_petId_state_dueAt_idx" ON "OperationalTask"("organizationId", "petId", "state", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationLog_idempotencyKey_key" ON "CommunicationLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CommunicationLog_organizationId_ownerId_createdAt_idx" ON "CommunicationLog"("organizationId", "ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationLog_organizationId_petId_createdAt_idx" ON "CommunicationLog"("organizationId", "petId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationLog_organizationId_channel_state_createdAt_idx" ON "CommunicationLog"("organizationId", "channel", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboxThread_externalKey_key" ON "InboxThread"("externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "InboxThread_idempotencyKey_key" ON "InboxThread"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InboxThread_organizationId_state_priority_slaDueAt_idx" ON "InboxThread"("organizationId", "state", "priority", "slaDueAt");

-- CreateIndex
CREATE INDEX "InboxThread_organizationId_ownerId_updatedAt_idx" ON "InboxThread"("organizationId", "ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "InboxThread_organizationId_assigneeId_state_idx" ON "InboxThread"("organizationId", "assigneeId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "InboxMessage_idempotencyKey_key" ON "InboxMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InboxMessage_organizationId_threadId_createdAt_idx" ON "InboxMessage"("organizationId", "threadId", "createdAt");

-- CreateIndex
CREATE INDEX "InboxMessage_organizationId_channel_externalMessageId_idx" ON "InboxMessage"("organizationId", "channel", "externalMessageId");

-- CreateIndex
CREATE INDEX "Incident_organizationId_state_severity_idx" ON "Incident"("organizationId", "state", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "Hospitalization_appointmentId_key" ON "Hospitalization"("appointmentId");

-- CreateIndex
CREATE INDEX "Hospitalization_organizationId_petId_state_idx" ON "Hospitalization"("organizationId", "petId", "state");

-- CreateIndex
CREATE INDEX "Hospitalization_organizationId_bedId_state_idx" ON "Hospitalization"("organizationId", "bedId", "state");

-- CreateIndex
CREATE INDEX "HospitalBed_organizationId_state_cleaningState_idx" ON "HospitalBed"("organizationId", "state", "cleaningState");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalBed_organizationId_locationId_label_key" ON "HospitalBed"("organizationId", "locationId", "label");

-- CreateIndex
CREATE INDEX "TreatmentTask_organizationId_scheduledAt_state_idx" ON "TreatmentTask"("organizationId", "scheduledAt", "state");

-- CreateIndex
CREATE INDEX "HospitalObservation_organizationId_hospitalizationId_record_idx" ON "HospitalObservation"("organizationId", "hospitalizationId", "recordedAt");

-- CreateIndex
CREATE INDEX "HospitalHandoff_organizationId_createdAt_idx" ON "HospitalHandoff"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "SurgicalCase_organizationId_state_scheduledAt_idx" ON "SurgicalCase"("organizationId", "state", "scheduledAt");

-- CreateIndex
CREATE INDEX "SurgicalCase_organizationId_petId_scheduledAt_idx" ON "SurgicalCase"("organizationId", "petId", "scheduledAt");

-- CreateIndex
CREATE INDEX "AnesthesiaRecord_organizationId_surgicalCaseId_idx" ON "AnesthesiaRecord"("organizationId", "surgicalCaseId");

-- CreateIndex
CREATE INDEX "AnesthesiaRecord_organizationId_petId_state_idx" ON "AnesthesiaRecord"("organizationId", "petId", "state");

-- CreateIndex
CREATE INDEX "DentalChart_organizationId_petId_state_idx" ON "DentalChart"("organizationId", "petId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "DentalChart_organizationId_petId_version_key" ON "DentalChart"("organizationId", "petId", "version");

-- CreateIndex
CREATE INDEX "Equipment_organizationId_locationId_state_idx" ON "Equipment"("organizationId", "locationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_organizationId_serialNumber_key" ON "Equipment"("organizationId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalIdentity_opaqueToken_key" ON "PhysicalIdentity"("opaqueToken");

-- CreateIndex
CREATE INDEX "PhysicalIdentity_organizationId_targetType_state_idx" ON "PhysicalIdentity"("organizationId", "targetType", "state");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalIdentity_organizationId_targetType_targetId_key" ON "PhysicalIdentity"("organizationId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "LabOrder_organizationId_petId_orderedAt_idx" ON "LabOrder"("organizationId", "petId", "orderedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Specimen_identityId_key" ON "Specimen"("identityId");

-- CreateIndex
CREATE INDEX "Specimen_organizationId_orderId_state_idx" ON "Specimen"("organizationId", "orderId", "state");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_state_idx" ON "Supplier"("organizationId", "state");

-- CreateIndex
CREATE INDEX "PurchaseOrder_organizationId_locationId_state_idx" ON "PurchaseOrder"("organizationId", "locationId", "state");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_state_idx" ON "PurchaseOrder"("supplierId", "state");

-- CreateIndex
CREATE INDEX "InventoryItem_organizationId_itemType_active_idx" ON "InventoryItem"("organizationId", "itemType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_organizationId_sku_key" ON "InventoryItem"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_organizationId_barcode_key" ON "InventoryItem"("organizationId", "barcode");

-- CreateIndex
CREATE INDEX "StockLot_organizationId_itemId_locationId_expiryAt_idx" ON "StockLot"("organizationId", "itemId", "locationId", "expiryAt");

-- CreateIndex
CREATE INDEX "StockLot_organizationId_state_storageState_idx" ON "StockLot"("organizationId", "state", "storageState");

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_organizationId_itemId_locationId_lotCode_key" ON "StockLot"("organizationId", "itemId", "locationId", "lotCode");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_itemId_locationId_createdAt_idx" ON "StockMovement"("organizationId", "itemId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_referenceType_referenceId_idx" ON "StockMovement"("organizationId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_petId_createdAt_idx" ON "StockMovement"("organizationId", "petId", "createdAt");

-- CreateIndex
CREATE INDEX "PrintTemplate_organizationId_kind_state_idx" ON "PrintTemplate"("organizationId", "kind", "state");

-- CreateIndex
CREATE UNIQUE INDEX "PrintTemplate_organizationId_kind_version_key" ON "PrintTemplate"("organizationId", "kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDocument_idempotencyKey_key" ON "GeneratedDocument"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GeneratedDocument_organizationId_ownerId_createdAt_idx" ON "GeneratedDocument"("organizationId", "ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedDocument_organizationId_petId_kind_idx" ON "GeneratedDocument"("organizationId", "petId", "kind");

-- CreateIndex
CREATE INDEX "GeneratedDocument_organizationId_state_createdAt_idx" ON "GeneratedDocument"("organizationId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "PrintJob_organizationId_state_createdAt_idx" ON "PrintJob"("organizationId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_organizationId_purpose_state_idx" ON "ChecklistTemplate"("organizationId", "purpose", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_organizationId_purpose_version_key" ON "ChecklistTemplate"("organizationId", "purpose", "version");

-- CreateIndex
CREATE INDEX "ChecklistRun_organizationId_targetType_targetId_idx" ON "ChecklistRun"("organizationId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "ChecklistRun_organizationId_state_createdAt_idx" ON "ChecklistRun"("organizationId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "StaffProfile_organizationId_employmentState_idx" ON "StaffProfile"("organizationId", "employmentState");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_organizationId_userId_key" ON "StaffProfile"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Credential_organizationId_userId_competency_state_idx" ON "Credential"("organizationId", "userId", "competency", "state");

-- CreateIndex
CREATE INDEX "Credential_organizationId_expiresAt_idx" ON "Credential"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "Precheck_organizationId_petId_state_idx" ON "Precheck"("organizationId", "petId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Precheck_organizationId_appointmentId_key" ON "Precheck"("organizationId", "appointmentId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_aggregateType_aggregateId_idx" ON "AuditEvent"("organizationId", "aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "OutboxEvent_organizationId_publishedAt_idx" ON "OutboxEvent"("organizationId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_organizationId_idempotencyKey_key" ON "OutboxEvent"("organizationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPaymentProof" ADD CONSTRAINT "TelegramPaymentProof_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TelegramRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPaymentProof" ADD CONSTRAINT "TelegramPaymentProof_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPaymentProof" ADD CONSTRAINT "TelegramPaymentProof_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMembership" ADD CONSTRAINT "StaffMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMembership" ADD CONSTRAINT "StaffMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerPetRelation" ADD CONSTRAINT "OwnerPetRelation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerPetRelation" ADD CONSTRAINT "OwnerPetRelation_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetFile" ADD CONSTRAINT "PetFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetFile" ADD CONSTRAINT "PetFile_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVariant" ADD CONSTRAINT "ServiceVariant_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalCase" ADD CONSTRAINT "ClinicalCase_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClinicalCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterProcedure" ADD CONSTRAINT "EncounterProcedure_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "GeneratedDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanTask" ADD CONSTRAINT "CarePlanTask_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageBalance" ADD CONSTRAINT "PackageBalance_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageUsage" ADD CONSTRAINT "PackageUsage_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "PackageBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerMembership" ADD CONSTRAINT "OwnerMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "InboxThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospitalization" ADD CONSTRAINT "Hospitalization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospitalization" ADD CONSTRAINT "Hospitalization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospitalization" ADD CONSTRAINT "Hospitalization_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospitalization" ADD CONSTRAINT "Hospitalization_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospitalization" ADD CONSTRAINT "Hospitalization_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "HospitalBed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBed" ADD CONSTRAINT "HospitalBed_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalBed" ADD CONSTRAINT "HospitalBed_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentTask" ADD CONSTRAINT "TreatmentTask_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalObservation" ADD CONSTRAINT "HospitalObservation_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgicalCase" ADD CONSTRAINT "SurgicalCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgicalCase" ADD CONSTRAINT "SurgicalCase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgicalCase" ADD CONSTRAINT "SurgicalCase_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnesthesiaRecord" ADD CONSTRAINT "AnesthesiaRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnesthesiaRecord" ADD CONSTRAINT "AnesthesiaRecord_surgicalCaseId_fkey" FOREIGN KEY ("surgicalCaseId") REFERENCES "SurgicalCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalChart" ADD CONSTRAINT "DentalChart_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalChart" ADD CONSTRAINT "DentalChart_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalChart" ADD CONSTRAINT "DentalChart_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalIdentity" ADD CONSTRAINT "PhysicalIdentity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specimen" ADD CONSTRAINT "Specimen_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specimen" ADD CONSTRAINT "Specimen_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LabOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specimen" ADD CONSTRAINT "Specimen_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintTemplate" ADD CONSTRAINT "PrintTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PrintTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PrintTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistRun" ADD CONSTRAINT "ChecklistRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistRun" ADD CONSTRAINT "ChecklistRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Precheck" ADD CONSTRAINT "Precheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
