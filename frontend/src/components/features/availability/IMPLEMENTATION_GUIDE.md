# Room Availability Timeline Component - Implementation Guide

## Overview

The `RoomAvailabilityTimeline` component is a fully-functional React component for visualizing room booking availability across a day. It provides an interactive, color-coded timeline with hover tooltips, click handlers, and a legend.

**Status:** ✅ Complete and Production-Ready

## Files Created

```
/frontend/src/components/features/availability/
├── RoomAvailabilityTimeline.tsx         # Main component (primary file)
├── RoomAvailabilityTimeline.test.tsx    # Unit tests with Vitest
├── RoomDetailsPage.example.tsx          # Usage example/reference
├── index.ts                             # Module exports
└── README.md                            # Component API documentation
```

## Quick Start

### 1. Import the Component

```typescript
import { RoomAvailabilityTimeline } from '@/components/features/availability';
import { useRoomDayTimeline } from '@/hooks/useAvailability';
```

### 2. Use with React Query Hook

```typescript
export function RoomSchedulePage({ roomId }: { roomId: number }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const { data: timeline, isLoading } = useRoomDayTimeline(roomId, date);

  if (isLoading) return <div>Loading...</div>;
  if (!timeline) return <div>No data</div>;

  return (
    <RoomAvailabilityTimeline
      segments={timeline.segments}
      dayStart="08:00"
      dayEnd="20:00"
      onFreeSlotClick={(startTime, endTime) => {
        // Handle free slot booking
      }}
      onSegmentClick={(segment) => {
        // Show booking details
      }}
    />
  );
}
```

### 3. Integration Points

The component integrates with:
- ✅ **Backend API:** `/rooms/{roomId}/availability/day/timeline`
- ✅ **React Query Hook:** `useRoomDayTimeline(roomId, date)`
- ✅ **Type System:** `TimelineSegment` and `RoomDayTimeline` types

## Component Architecture

### Core Features

1. **Responsive Timeline Bar**
   - Proportionally sized segments
   - Smooth animations on hover
   - Automatically calculated positions

2. **Segment Types**
   - Free (green) - clickable, available for booking
   - Booked (red) - clickable, shows booking details
   - Restricted (dark red) - booked but details masked

3. **Interactive Elements**
   - Hover tooltips with segment details
   - Click handlers for bookings and free slots
   - Time label header showing hourly markers

4. **Visual Design**
   - Clean, minimal interface
   - TailwindCSS styling
   - Color-coded legend
   - Responsive layout

### Data Flow

```
Backend API
    ↓
useRoomDayTimeline Hook
    ↓
RoomDayTimeline Response
    ↓
RoomAvailabilityTimeline Component
    ↓
User Interaction (Click/Hover)
    ↓
Callback Handlers (onFreeSlotClick, onSegmentClick)
```

## Configuration

### Props Reference

| Prop | Type | Required | Default | Purpose |
|------|------|----------|---------|---------|
| `segments` | `TimelineSegment[]` | ✅ Yes | - | Array of booking/free slots |
| `dayStart` | `string` | ❌ No | `"00:00"` | Day start time (HH:MM) |
| `dayEnd` | `string` | ❌ No | `"24:00"` | Day end time (HH:MM) |
| `onSegmentClick` | `function` | ❌ No | - | Callback when booking clicked |
| `onFreeSlotClick` | `function` | ❌ No | - | Callback when free slot clicked |

### Example Configurations

**Business Hours Only**
```typescript
<RoomAvailabilityTimeline
  segments={timeline.segments}
  dayStart="09:00"
  dayEnd="17:00"
/>
```

**Full Day with Interactions**
```typescript
<RoomAvailabilityTimeline
  segments={timeline.segments}
  dayStart="00:00"
  dayEnd="24:00"
  onFreeSlotClick={(start, end) => bookRoom(start, end)}
  onSegmentClick={(seg) => showDetails(seg.booking)}
/>
```

## Implementation Details

### Utility Functions

The component includes several helper functions for time calculations:

1. **`getMinutesFromMidnight(isoString)`**
   - Converts ISO datetime to minutes since midnight
   - Used internally for positioning calculations

2. **`minutesToTimeString(minutes)`**
   - Converts minutes to HH:MM format
   - Used for time label generation

3. **`getSegmentDimensions(segment, dayStartMin, dayDurationMin)`**
   - Calculates left position and width for each segment
   - Handles edge cases (segments outside day range)

4. **`formatTime(isoString, format)`**
   - Formats ISO datetime for display
   - Supports HH:MM and HH:MM:SS formats

### Component Structure

```
RoomAvailabilityTimeline (main)
├── Time Label Row
│   └── TimeLabel × n
├── Timeline Bar Container
│   ├── TimelineSegmentComponent × n
│   │   ├── Segment div with styling
│   │   └── Time display (if wide)
│   └── TimelineTooltip (floating)
└── Legend
    ├── Available indicator
    ├── Booked indicator
    └── Restricted indicator
```

### Styling Approach

All styling uses TailwindCSS utilities:
- **Colors:** `bg-green-500`, `bg-red-500`, `bg-red-900`
- **Layout:** `flex`, `absolute`, `relative`, `overflow-hidden`
- **Sizing:** `w-full`, `h-12`, `text-xs`, `text-sm`
- **Interactions:** `cursor-pointer`, `hover:opacity-100`, `transition-opacity`

To customize colors, modify the component's Tailwind class references:

```typescript
// In TimelineSegmentComponent
const bgColor =
  segment.status === "free"
    ? "bg-green-500"        // Change this color
    : segment.isRestricted
    ? "bg-red-900"          // Or this
    : "bg-red-500";         // Or this
```

## Common Use Cases

### Use Case 1: Booking System

```typescript
const [bookingStart, setBookingStart] = useState<string | null>(null);

<RoomAvailabilityTimeline
  segments={timeline.segments}
  onFreeSlotClick={(start, end) => {
    setBookingStart(start);
    openBookingModal({ start, end });
  }}
/>
```

### Use Case 2: Admin View (All Details)

```typescript
<RoomAvailabilityTimeline
  segments={timeline.segments}
  onSegmentClick={(segment) => {
    showAdminPanel({
      booking: segment.booking,
      details: 'full'
    });
  }}
/>
```

### Use Case 3: Student View (Restricted)

```typescript
// Backend already filters restricted segments
<RoomAvailabilityTimeline
  segments={timeline.segments}
  // Tooltips automatically handle restricted display
/>
```

### Use Case 4: Read-Only Display

```typescript
<RoomAvailabilityTimeline
  segments={timeline.segments}
  dayStart="08:00"
  dayEnd="18:00"
  // No callbacks - click events are ignored
/>
```

## Testing

The component includes comprehensive unit tests covering:

- ✅ Component rendering
- ✅ Time label generation
- ✅ Segment click handlers
- ✅ Free slot click handlers
- ✅ Tooltip display on hover
- ✅ Edge cases (empty segments, default props)
- ✅ Accessibility features

**Run Tests:**
```bash
npm run test -- RoomAvailabilityTimeline
```

## Performance Considerations

1. **Segment Rendering**
   - All segments render simultaneously
   - No virtualization needed (typically < 50 segments per day)
   - Position calculations are O(n) where n = segments

2. **Tooltip Rendering**
   - Single tooltip component (conditionally displayed)
   - Position updates on mouse move
   - No performance impact from hover state

3. **Re-renders**
   - Component re-renders only when props change
   - Hover and tooltip state doesn't trigger parent re-renders

**Optimization Tips:**
- Memoize the component if used in a complex parent:
  ```typescript
  const MemoizedTimeline = React.memo(RoomAvailabilityTimeline);
  ```
- Use stable segment arrays (don't recreate on each render)

## Accessibility Features

- ✅ Semantic HTML structure
- ✅ Title attributes for screen readers
- ✅ Color coding with text fallback in tooltips
- ✅ Keyboard-friendly positioning (no tab trap)

**Further Improvements:**
- Add ARIA labels for better screen reader support
- Implement full keyboard navigation (arrow keys)
- Add high-contrast mode toggle

## Troubleshooting

### Problem: Segments not displaying

**Solution:** Verify segments have valid ISO datetime strings and fall within `dayStart`/`dayEnd` range.

```typescript
// ✅ Correct format
{ start: "2024-01-15T08:00:00Z", end: "2024-01-15T09:00:00Z" }

// ❌ Wrong format
{ start: "08:00", end: "09:00" }  // Missing ISO format
```

### Problem: Tooltip position off-screen

**Solution:** This is expected. Tooltip uses fixed positioning relative to the timeline. Consider wrapping in a container with `position: relative` if needed.

### Problem: Callbacks not firing

**Solution:** Ensure callbacks are defined and segments have correct status:
```typescript
// onFreeSlotClick only fires for status: 'free'
// onSegmentClick only fires for status: 'booked'
```

## Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Requires ES2020+ support

## Future Enhancements

Potential features for future versions:

1. **Multi-day View**
   - Week view
   - Month view with mini calendars

2. **Drag & Drop**
   - Drag to create bookings
   - Drag to reschedule

3. **Export**
   - Export as PNG
   - Export as PDF

4. **Customization**
   - Custom color schemes
   - Custom segment labels
   - Custom time intervals

5. **Real-time Updates**
   - WebSocket for live bookings
   - Auto-refresh on changes

## Support & Documentation

- **Component README:** `/src/components/features/availability/README.md`
- **Example Implementation:** `/src/components/features/availability/RoomDetailsPage.example.tsx`
- **Tests:** `/src/components/features/availability/RoomAvailabilityTimeline.test.tsx`
- **Type Definitions:** `/src/lib/api/types.ts` (TimelineSegment, RoomDayTimeline)

## Deployment Checklist

- ✅ Component created and tested
- ✅ Types defined and imported
- ✅ Documentation complete
- ✅ Example implementation provided
- ✅ Unit tests included
- ✅ Build verified (no errors)
- ✅ TailwindCSS styling included
- ✅ Accessibility considered

**Ready for Production:** Yes ✅
