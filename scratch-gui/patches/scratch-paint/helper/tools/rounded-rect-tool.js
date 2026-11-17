import paper from '@turbowarp/paper';
import Modes from '../../lib/modes';
import {styleShape} from '../style-path';
import {clearSelection} from '../selection';
import {getSquareDimensions} from '../math';
import BoundingBoxTool from '../selection-tools/bounding-box-tool';
import NudgeTool from '../selection-tools/nudge-tool';

let roundedRectRadius = 12;

export const getRoundedRectRadius = () => roundedRectRadius;
export const setRoundedRectRadius = value => {
    const radius = Number(value);
    roundedRectRadius = Number.isFinite(radius) ? Math.max(0, Math.min(200, radius)) : 12;
};

/**
 * Tool for drawing rounded rectangles.
 */
class RoundedRectTool extends paper.Tool {
    static get TOLERANCE () {
        return 2;
    }
    constructor (setSelectedItems, clearSelectedItems, setCursor, onUpdateImage) {
        super();
        this.setSelectedItems = setSelectedItems;
        this.clearSelectedItems = clearSelectedItems;
        this.onUpdateImage = onUpdateImage;
        this.boundingBoxTool = new BoundingBoxTool(
            Modes.ROUNDED_RECT,
            setSelectedItems,
            clearSelectedItems,
            setCursor,
            onUpdateImage
        );
        const nudgeTool = new NudgeTool(Modes.ROUNDED_RECT, this.boundingBoxTool, onUpdateImage);

        this.onMouseDown = this.handleMouseDown;
        this.onMouseMove = this.handleMouseMove;
        this.onMouseDrag = this.handleMouseDrag;
        this.onMouseUp = this.handleMouseUp;
        this.onKeyUp = nudgeTool.onKeyUp;
        this.onKeyDown = nudgeTool.onKeyDown;

        this.rect = null;
        this.colorState = null;
        this.isBoundingBoxMode = null;
        this.active = false;
    }
    getHitOptions () {
        return {
            segments: true,
            stroke: true,
            curves: true,
            fill: true,
            guide: false,
            match: hitResult =>
                (hitResult.item.data && (hitResult.item.data.isScaleHandle || hitResult.item.data.isRotHandle)) ||
                hitResult.item.selected,
            tolerance: RoundedRectTool.TOLERANCE / paper.view.zoom
        };
    }
    onSelectionChanged (selectedItems) {
        this.boundingBoxTool.onSelectionChanged(selectedItems);
    }
    setColorState (colorState) {
        this.colorState = colorState;
    }
    handleMouseDown (event) {
        if (event.event.button > 0) return;
        this.active = true;

        if (this.boundingBoxTool.onMouseDown(
            event, false, false, false, this.getHitOptions())) {
            this.isBoundingBoxMode = true;
        } else {
            this.isBoundingBoxMode = false;
            clearSelection(this.clearSelectedItems);
        }
    }
    handleMouseDrag (event) {
        if (event.event.button > 0 || !this.active) return;
        if (this.isBoundingBoxMode) {
            this.boundingBoxTool.onMouseDrag(event);
            return;
        }

        if (this.rect) {
            this.rect.remove();
        }

        const rect = new paper.Rectangle(event.downPoint, event.point);
        const squareDimensions = getSquareDimensions(event.downPoint, event.point);
        if (event.modifiers.shift) {
            rect.size = squareDimensions.size.abs();
        }

        const left = Math.min(rect.left, rect.right);
        const right = Math.max(rect.left, rect.right);
        const top = Math.min(rect.top, rect.bottom);
        const bottom = Math.max(rect.top, rect.bottom);
        const radius = Math.max(0, Math.min(getRoundedRectRadius(), (right - left) / 2, (bottom - top) / 2));
        this.rect = new paper.Path();
        this.rect.moveTo(left + radius, top);
        this.rect.lineTo(right - radius, top);
        this.rect.quadraticCurveTo(right, top, right, top + radius);
        this.rect.lineTo(right, bottom - radius);
        this.rect.quadraticCurveTo(right, bottom, right - radius, bottom);
        this.rect.lineTo(left + radius, bottom);
        this.rect.quadraticCurveTo(left, bottom, left, bottom - radius);
        this.rect.lineTo(left, top + radius);
        this.rect.quadraticCurveTo(left, top, left + radius, top);
        this.rect.closePath();
        if (event.modifiers.alt) {
            this.rect.position = event.downPoint;
        } else if (event.modifiers.shift) {
            this.rect.position = squareDimensions.position;
        } else {
            const dimensions = event.point.subtract(event.downPoint);
            this.rect.position = event.downPoint.add(dimensions.multiply(0.5));
        }

        styleShape(this.rect, this.colorState);
    }
    handleMouseUp (event) {
        if (event.event.button > 0 || !this.active) return;
        if (this.isBoundingBoxMode) {
            this.boundingBoxTool.onMouseUp(event);
            this.isBoundingBoxMode = null;
            return;
        }

        if (this.rect) {
            if (this.rect.area < RoundedRectTool.TOLERANCE / paper.view.zoom) {
                this.rect.remove();
                this.rect = null;
            } else {
                this.rect.selected = true;
                this.setSelectedItems();
                this.onUpdateImage();
                this.rect = null;
            }
        }
        this.active = false;
    }
    handleMouseMove (event) {
        this.boundingBoxTool.onMouseMove(event, this.getHitOptions());
    }
    deactivateTool () {
        this.boundingBoxTool.deactivateTool();
    }
}

export default RoundedRectTool;
