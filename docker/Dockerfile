FROM mcr.microsoft.com/playwright:v1.51.0-jammy
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps ./apps
COPY fixtures ./fixtures
COPY .a11yguard.yml tsconfig.base.json action.yml ./
RUN npm install && npx playwright install chromium
CMD ["npm", "run", "demo"]
