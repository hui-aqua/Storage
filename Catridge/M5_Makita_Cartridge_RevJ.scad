// Rev J | rounded rear finger pull | mm
// Rear access required. Print battery-contact face down, grip up.
// Rear plate retains the Rev F M4 pattern and battery contact plane.
// Allow 30 mm behind the rear plate for the grip plus cap clearance.
// Check finger access with the rear cap removed. Use M4 washers and locknuts.
// OpenSCAD "assembly" shows the orientation. Battery shapes are approximate.
part = "rear";
bore_min = 103;
diametral_gap = 1.0;
length_axial = 40;
land_width = 8;
ring_wall = 6;
shell_wall = 7;
mid_relief = 0.35; // Radial relief between the two pipe-contact lands
rod_tube_od = 13;
deck_thickness = 10;
standoff_height = 4;
spacer_od = 9;
spacer_bore = 3.6;
screw_clearance = 3.4;
lead_chamfer = 0.7;


battery_length = 113;
rod_y = 43;
rod_hole = 4.5;
ear_radius = 5.5;
saddle_thickness = 6;
finger_length = 6;
finger_inner_y = 34; // Photo estimate, measured from tube axis
finger_width = 3;
finger_x = 22; // Contacts at battery side only
finger_depth_x = 7;
front_cable_gap = 30;
end_pad = 1;
rear_thickness = 14;
middle_bridge_x = 39;
middle_bridge_radius = 4;
grip_height = 30;
grip_span = 25;
grip_rise = 16;
grip_radial_radius = 7;
grip_depth_radius = 9;
grip_root_radius = grip_height - grip_rise - grip_radial_radius;
grip_section_steps = 64;
grip_arch_steps = 72;
grip_root_steps = 12;

$fn = 120;
r = (bore_min - diametral_gap) / 2;
body_length = length_axial - standoff_height;
hole_centers = [for (x = [-15, 15], y = [-31, 31]) [x, y]];
rod_positions = [-rod_y, rod_y];
pack_front = -front_cable_gap;
pack_back = pack_front - battery_length;
rear_start = pack_back - end_pad - rear_thickness;

assert(part == "middle" || part == "front" || part == "rear" ||
       part == "gauge" || part == "spacer" || part == "assembly", "Unknown part.");
assert(rod_y + rod_tube_od / 2 <= r - lead_chamfer,
       "Rod sleeves exceed the entry chamfer.");
assert(rod_y + rod_tube_od / 2 > r - mid_relief - shell_wall,
       "Rod sleeves must overlap the sidewall.");
assert(2 * (land_width + mid_relief) < body_length && deck_thickness < body_length,
       "Check front insert axial dimensions.");
assert(rod_y + ear_radius < r - lead_chamfer, "Rod ears exceed fit diameter.");
assert(norm([finger_x + finger_depth_x, finger_inner_y + finger_width]) < r,
       "Locating fingers exceed fit diameter.");
assert(rod_y - rod_hole / 2 > 31 + screw_clearance / 2,
       "Check DIN mounting hole clearance.");

echo(guide_od = 2 * r, rod_spacing = 2 * rod_y,
     assembly_length_excluding_device_and_hardware = length_axial - rear_start + grip_height);

module rod_bores(start, depth) {
    for (y = rod_positions)
        translate([0, y, start])
            cylinder(d = rod_hole, h = depth);
}

module end_land() {
    cylinder(h = lead_chamfer, r1 = r - lead_chamfer, r2 = r);
    translate([0, 0, lead_chamfer])
        cylinder(h = land_width - 2 * lead_chamfer, r = r);
    translate([0, 0, land_width - lead_chamfer])
        cylinder(h = lead_chamfer, r1 = r, r2 = r - lead_chamfer);
}

module annular_land() {
    difference() {
        end_land();
        translate([0, 0, -1])
            cylinder(h = land_width + 2, r = r - ring_wall);
    }
}

// Continuous wall carries transverse shear and torsion between the lands.
module front_outer_profile() {
    rotate_extrude()
        polygon([
            [0, 0], [r - lead_chamfer, 0], [r, lead_chamfer],
            [r, land_width], [r - mid_relief, land_width + mid_relief],
            [r - mid_relief, body_length - land_width - mid_relief],
            [r, body_length - land_width], [r, body_length - lead_chamfer],
            [r - lead_chamfer, body_length], [0, body_length]
        ]);
}

module insert() {
    difference() {
        union() {
            difference() {
                front_outer_profile();
                translate([0, 0, -1])
                    cylinder(h = body_length - deck_thickness + 1,
                             r = r - mid_relief - shell_wall);
            }
            // Full-height sleeves merge into the wall and support M4 clamping.
            for (y = rod_positions)
                translate([0, y, 0])
                    cylinder(h = body_length, d = rod_tube_od);
        }
        for (p = hole_centers)
            translate([p[0], p[1], body_length - deck_thickness - 1])
                cylinder(h = deck_thickness + 2,
                         d = screw_clearance);
        rod_bores(-1, body_length + 2);
        // Rounded corners reduce stress concentration at the cable window.
        translate([0, 0, body_length - deck_thickness - 1])
            linear_extrude(height = deck_thickness + 2)
                hull() for (x = [-10, 10], y = [-7, 7])
                    translate([x, y]) circle(r = 2);
    }
}

// Each station is [x, z, normal_x, normal_z, radial_radius, depth_radius].
function root_station(side, angle) =
    let(flare = grip_root_radius * (1 - sin(angle)))
    [side * grip_span, grip_root_radius * (1 - cos(angle)),
     side, 0, grip_radial_radius + flare, grip_depth_radius + flare];

function arch_station(angle) =
    let(normal = [cos(angle) / grip_span, sin(angle) / grip_rise],
        unit = normal / norm(normal))
    [grip_span * cos(angle), grip_root_radius + grip_rise * sin(angle),
     unit[0], unit[1], grip_radial_radius, grip_depth_radius];

function grip_vertex(station, angle) =
    let(radial = station[4] * cos(angle))
    [station[0] + station[2] * radial,
     station[5] * sin(angle),
     rear_thickness + station[1] + station[3] * radial];

module rear_grip() {
    // A single elliptic sweep. Quarter-circle flares meet the disc tangentially.
    stations = concat(
        [[grip_span, -0.6, 1, 0, grip_radial_radius + grip_root_radius,
          grip_depth_radius + grip_root_radius]],
        [for (i = [0 : grip_root_steps - 1])
            root_station(1, i * 90 / grip_root_steps)],
        [for (i = [0 : grip_arch_steps]) arch_station(i * 180 / grip_arch_steps)],
        [for (i = [grip_root_steps - 1 : -1 : 0])
            root_station(-1, i * 90 / grip_root_steps)],
        [[-grip_span, -0.6, -1, 0, grip_radial_radius + grip_root_radius,
          grip_depth_radius + grip_root_radius]]
    );
    n = grip_section_steps;
    last = len(stations) - 1;
    polyhedron(
        points = [for (station = stations, j = [0 : n-1])
            grip_vertex(station, j * 360 / n)],
        faces = concat(
            [[for (j = [0 : n-1]) j]],
            [for (i = [0 : last-1], j = [0 : n-1])
                let(k = (j+1) % n, a = i*n+j, b = i*n+k,
                    c = (i+1)*n+k, d = (i+1)*n+j)
                each [[a,d,c], [a,c,b]]],
            [[for (j = [n-1 : -1 : 0]) last*n+j]]
        ),
        convexity = 6
    );
}

assert(grip_root_radius > 0 && grip_span > grip_radial_radius + grip_root_radius);
assert(norm([grip_span + grip_radial_radius + grip_root_radius,
             grip_depth_radius + grip_root_radius]) < r - lead_chamfer);

module rear_plate() {
    difference() {
        union() {
            rotate_extrude()
                polygon([[0, 0], [r-lead_chamfer, 0], [r, lead_chamfer],
                         [r, rear_thickness-lead_chamfer],
                         [r-lead_chamfer, rear_thickness], [0, rear_thickness]]);
            rear_grip();
        }
        rod_bores(-1, rear_thickness + 2);
    }
}

module middle_bracket() {
    difference() {
        union() {
            linear_extrude(height = saddle_thickness)
                union() {
                    // Move the bridge to the right of the battery indicator.
                    hull() for (side = [-1, 1])
                        translate([middle_bridge_x, side * 15])
                            circle(r = middle_bridge_radius);
                    for (side = [-1, 1]) {
                        hull() {
                            translate([0, side * rod_y]) circle(r = ear_radius);
                            translate([finger_x + finger_depth_x/2,
                                       side * (finger_inner_y - 2)]) circle(r = 4);
                        }
                        hull() {
                            translate([finger_x + finger_depth_x/2,
                                       side * (finger_inner_y - 2)]) circle(r = 4);
                            translate([middle_bridge_x, side * 15])
                                circle(r = middle_bridge_radius);
                        }
                    }
                }
            for (side = [-1, 1])
                translate([finger_x,
                           side > 0 ? finger_inner_y : -finger_inner_y-finger_width,
                           saddle_thickness - 1])
                    cube([finger_depth_x, finger_width, finger_length + 1]);
        }
        rod_bores(-1, saddle_thickness + 2);
    }
}

module spacer() {
    difference() {
        cylinder(d = spacer_od, h = standoff_height);
        translate([0, 0, -1])
            cylinder(d = spacer_bore, h = standoff_height + 2);
    }
}

module assembly() {
    color("steelblue") insert();
    for (p = hole_centers)
        color("steelblue") translate([p[0], p[1], body_length]) spacer();
    color("steelblue") translate([0, 0, rear_start + rear_thickness])
        rotate([180, 0, 0]) rear_plate();
    color("orange") translate([0, 0, pack_front + end_pad + saddle_thickness])
        rotate([180, 0, 0]) middle_bracket();
    for (y = rod_positions)
        color("silver") translate([0, y, rear_start])
            cylinder(d = 4, h = body_length - rear_start + 5);
    // Rough end-view silhouette for orientation only.
    %translate([0, 0, pack_back])
        linear_extrude(height = battery_length)
            hull() for (x = [3, 29], y = [-28, 28])
                translate([x, y]) circle(r = 5);
    %translate([0, 0, pack_front - 102])
        linear_extrude(height = 102)
            hull() for (x = [-34, -7], y = [-27, 27])
                translate([x, y]) circle(r = 5);
}

if (part == "middle") middle_bracket();
if (part == "front")
    translate([0, 0, body_length]) rotate([180, 0, 0]) insert();
if (part == "spacer") spacer();
if (part == "rear") rear_plate();
if (part == "gauge") annular_land();
if (part == "assembly") assembly();



