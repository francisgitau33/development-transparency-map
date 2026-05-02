-- Add optional donor / funding / grant reference code to Project.
--
-- Purpose: Some donors assign grant, funding, budget-line, or
-- government-objective codes to specific grants. This column lets users
-- trace a project back to a donor grant reference without affecting any
-- existing behaviour.
--
-- Additive: the column is nullable, so all existing rows are backward
-- compatible and no backfill is required. The field is intentionally NOT
-- indexed because it is not used in any query predicate or report.

ALTER TABLE "Project" ADD COLUMN "donorFundingCode" TEXT;
