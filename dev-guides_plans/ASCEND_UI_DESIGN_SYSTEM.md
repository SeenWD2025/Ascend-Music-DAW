# Ascend UI/UX Design System & Guides

**Status:** Draft / Source of Truth  
**Last Updated:** January 10, 2026  
**Context:** Creating a "Productivity Suite meets Streaming Service" experience.

---

## 1. Design Philosophy

Ascend Music Group (AMG) requires a dual-nature interface:
1.  **The Platform (Discovery):** A rich, immersive, media-centric experience for fans and A&R to discover talent. (Reference: Spotify, YouTube, Apple Music).
2.  **The Workspace (Operations):** A dense, high-utility, dashboard-driven environment for Artists, Pros, and Managers to do work. (Reference: Linear, Notion, Stripe Dashboard).

**Core Tenets:**
-   **Mobile-First, Desktop-Power:** Discovery is mobile-native; Workspaces utilize desktop real estate but degrade gracefully.
-   **Silver & Gold:** A palette evoking premium industry status (Platinum/Gold records) grounded in professional Navy.
-   **Content Forward:** Media art and waveforms take center stage in the discovery view; Data tables and kanban boards take center stage in the workspace.

---

## 2. Design Tokens

### 2.1 Color Palette

**Primary (Brand & Depth)**
-   **Navy (Rich):** `#0B1221` (Backgrounds, Sidebars, Primary Buttons)
-   **Midnight:** `#1A2333` (Cards, Panels)
-   **Slate:** `#475569` (Muted Text, Borders)

**Accent (Action & Status)**
-   **Gold (Metallic):** `#D4AF37` (Primary Actions, Active States, Verifications)
-   **Yellow (Bright):** `#FCD34D` (Highlights, Hovers)
-   **Alert Red:** `#EF4444` (Destructive, Errors)
-   **Success Green:** `#10B981` (Completed, Paid)

**Neutrals (Surface & Typography)**
-   **Silver:** `#F1F5F9` (Page Backgrounds - Light Mode / App Canvas)
-   **Platinum:** `#E2E8F0` (Borders, Dividers)
-   **Off-White:** `#F8FAFC` (Card Backgrounds)
-   **Charcoal:** `#1E293B` (Primary Text)

*Note: The UI allows for a "Dark Mode" (Default for Discovery) and "Light/Hybrid Mode" (Default for Workspace/Docs), or a unified Dark Mode if preferred for consistency.*

### 2.2 Typography

**Titles & Display (Serif)**
*Used for: Page Titles, Hero Headings, Artist Names on Profile.*
-   **Font Family:** `Playfair Display`, `Merriweather`, or similar high-contrast serif.
-   **Feel:** Elegant, editorial, established.

**Interface & Body (Sans-Serif)**
*Used for: Navigation, Subheaders, Tabular Data, Chat, Forms.*
-   **Font Family:** `Inter`, `Geist Sans`, or system sans.
-   **Feel:** Clean, legible, utilitarian.

### 2.3 Spacing & Radius
-   **Radius:** `0.5rem` (8px) for cards, `0.25rem` (4px) for dense workspace elements.
-   **Grid:** 4px baseline grid. Dense density for productivity views.

---

## 3. Global Layouts

### 3.1 Public / Discovery Layout (The "Streaming" Shell)
*For: Home, Radio, Playlists, Artist Profiles (Public View).*

-   **Header (Sticky):** Search bar (omnipresent), "Now Playing" mini-indicator, Login/Profile dropdown.
-   **Navigation:**
    -   *Mobile:* Bottom Tab Bar (Home, Search, Library, Radio).
    -   *Desktop:* Left Sidebar (Collapsible, dark navy).
-   **Content Area:** Fluid grid of album art/cards.
-   **Player Bar:** Fixed at bottom (persistent across navigation).

### 3.2 Workspace Layout (The "Productivity" Shell)
*For: Artist Dashboard, Project Management, Client Portal, Admin, Label Ops.*

-   **Sidebar (Fixed Left):**
    -   Context switcher (Workspace/Team dropdown).
    -   Tree-view navigation (Projects, Files, Finances, Settings).
    -   User section at bottom.
-   **Top Bar:** Breadcrumbs, Page Actions (e.g., "New Task", "Export"), Global Search.
-   **Main Stage:**
    -   Panel-based layout (think IDE).
    -   Collapsible right inspector panel (for item details, file metadata).
    -   Multi-view support (List, Board, Calendar) for data.

---

## 4. Feature UX Guides (Sprint Alignment)

### Sprint 1: Auth & Profiles
-   **Auth Screens:** Centered card on "Navy/Midnight" background. Gold accent for "Sign In".
-   **Onboarding Wizard:** Stepper interface (clean sans-serif). "I am a Creator" vs "I am a Pro" visual cards selection.
-   **Profile (View):** Hero header with large banner image + Serif Artist Name. Tabs for "Tracks", "Services", "About".
-   **Profile (Edit):** Form-based, grouped sections in cards.

### Sprint 2: Drive & Upload Manager
-   **Upload Dropzone:** Large dashed area in "Silver" background.
-   **Progress UI:** Floating toast or bottom-right panel showing upload % across multiple files.
-   **File Grid/List:**
    -   *Grid:* Thumbnail preview (if image) or File Type Icon.
    -   *List:* Standard file columns (Name, Size, Type, Date) with "Privacy" badge (Lock icon default).
-   **Tags:** Colored pill badges for "Demo", "Master", "Contract".

### Sprint 3: Workspaces & Tasks
-   **Workspace Home:** Dashboard view summarizing "Recent Files", "My Tasks", "Project Status".
-   **Task Board:** Kanban or List toggle.
    -   *Task Card:* Title, Assignee avatar, Due Date (colored if overdue), attached file count.
-   **Submission Flow:** Modal dialog. "Select from Drive" browser. Explicit confirmation of "Sharing this will make it visible to workspace members".

### Sprint 4: Payments & Marketplace (Pro Dashboard)
-   **Financials:** High-level metrics cards (Total Earned, Pending, Next Payout) in Gold/Navy.
-   **Order Row:** Status badges (Pending = Yellow, Paid = Green).
-   **Checkout:** Stripe Elements embedded clean modal.
-   **Service Listings:** "Product Cards" with price, rating, and "Book Now" (Gold) button.

### Sprint 5: Chat & Contacts
-   **Layout:** Three-column layout (Contact/Room List | Chat Thread | Thread Details/Shared Files).
-   **Bubbles:**
    -   *Me:* Navy background, White text.
    -   *Them:* Silver background, Dark text.
-   **Presence:** Green dot on avatars.
-   **Attachments:** Rich previews within chat bubbles.

### Sprint 6 & 7: Playlists, Radio, Now Playing
-   **Radio Interface:**
    -   "On Air" visualizer (waveform animation).
    -   Schedule list below player.
-   **Playlist View:**
    -   Header: Cover art (large), Title (Serif), Curator info.
    -   Tracklist: Index, Song Title, Artist, Duration. Hover reveals "Play" button.

### Sprint 8, 9, 12: Integrations & Marketing
-   **Calendar:** Month/Week/Day toggle view. Events color-coded by type (Session, Deadline, Release).
-   **Zoom:** "Join Meeting" button appears prominently on event cards 15m before start.
-   **Featured Surfaces:** Carousel sliders for "Spotlight Artists" or "New Releases".

### Sprint 10 & 11: AI Agent & Services
-   **Agent Interface:**
    -   Distinct "Chat" interface, perhaps separated by a specific border color (Gold/Metallic) to denote "AI Assistance".
    -   Typing indicators.
    -   Structured responses (lists, cards) not just text.
-   **Jobs Queue:** Table view showing "Job ID", "Status" (Processing, Done, Failed), "Output" (Download Link).

---

## 5. UI Component Library (ShadCN Mapping)

We will utilize **ShadCN UI** composed with Tailwind.

-   **Cards:** `Card`, `CardHeader` (Serif Title), `CardContent` (Sans Text).
-   **Buttons:**
    -   `default` (Navy bg, white text) -> Primary.
    -   `secondary` (Silver bg, dark text) -> Secondary.
    -   `outline` (Gold border, gold text) -> Tertiary/Accent.
-   **Inputs:** `Input`, `Select` with `ring-gold-500` focus states.
-   **Data Display:** `Table` (dense), `Badge` (pill shape).
-   **Feedback:** `Toast` (bottom-right), `Skeleton` (loading states).
-   **Overlays:** `Sheet` (Mobile menu, detailed inspectors), `Dialog` (Confirms/Forms).

## 6. Iconography
-   Use **Lucide React**.
-   Stroke width: `1.5px` (Fine/Elegant).
-   Color: Inherits text color usually, or Gold for feature icons.
