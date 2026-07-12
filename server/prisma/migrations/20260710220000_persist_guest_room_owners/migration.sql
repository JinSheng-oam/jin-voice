ALTER TABLE "Room" ADD COLUMN "ownerGuestId" TEXT;
ALTER TABLE "Room" ADD COLUMN "ownerName" TEXT;

CREATE INDEX "Room_ownerGuestId_idx" ON "Room"("ownerGuestId");
