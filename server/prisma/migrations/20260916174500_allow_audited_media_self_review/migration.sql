ALTER TABLE `media_asset_authorizations`
  ADD COLUMN `self_review_acknowledged` BOOLEAN NOT NULL DEFAULT false AFTER `review_note`;

ALTER TABLE `media_asset_authorizations`
  DROP CHECK `media_asset_authorizations_review_check`,
  ADD CONSTRAINT `media_asset_authorizations_review_check`
    CHECK (
      (`review_status` <> 'DRAFT' OR (
        `submitted_by` IS NULL
        AND `submitted_at` IS NULL
        AND `reviewed_by` IS NULL
        AND `reviewed_at` IS NULL
        AND `review_note` IS NULL
        AND `self_review_acknowledged` = false
      ))
      AND
      (`review_status` <> 'IN_REVIEW' OR (
        `submitted_by` IS NOT NULL
        AND `submitted_at` IS NOT NULL
        AND `reviewed_by` IS NULL
        AND `reviewed_at` IS NULL
        AND `review_note` IS NULL
        AND `self_review_acknowledged` = false
      ))
      AND
      (`review_status` <> 'APPROVED' OR (
        `public_web_use_allowed` = true
        AND `source_type` <> 'LEGACY_UNVERIFIED'
        AND `authorization_basis` IS NOT NULL
        AND CHAR_LENGTH(TRIM(`authorization_basis`)) > 0
        AND `evidence_reference` IS NOT NULL
        AND CHAR_LENGTH(TRIM(`evidence_reference`)) > 0
        AND `submitted_by` IS NOT NULL
        AND `submitted_at` IS NOT NULL
        AND `reviewed_by` IS NOT NULL
        AND `reviewed_at` IS NOT NULL
        AND (
          `reviewed_by` <> `submitted_by`
          OR `self_review_acknowledged` = true
        )
      ))
      AND
      (`review_status` <> 'REJECTED' OR (
        `submitted_by` IS NOT NULL
        AND `submitted_at` IS NOT NULL
        AND `reviewed_by` IS NOT NULL
        AND `reviewed_at` IS NOT NULL
        AND `reviewed_by` <> `submitted_by`
        AND `review_note` IS NOT NULL
        AND CHAR_LENGTH(TRIM(`review_note`)) > 0
        AND `self_review_acknowledged` = false
      ))
    );
