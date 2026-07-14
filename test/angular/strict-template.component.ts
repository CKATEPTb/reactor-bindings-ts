import {Component} from "@angular/core";
import {Flux} from "reactor-core-ts";
import {PublisherDirective} from "@/angular/publisher.directive.js";

interface TemplateUser {
    readonly id: number;
    readonly name: string;
}

/** Compile-only fixture protecting structural-directive context inference. */
@Component({
    standalone: true,
    imports: [PublisherDirective],
    template: `
        <p *publisher="let user from users">{{ user.id }}:{{ user.name.toUpperCase() }}</p>
        <p *publisher="let user from snapshots; mode: 'snapshot'">{{ user.id }}</p>
        <ng-template [publisher]="users" let-user>{{ user.id }}:{{ user.name }}</ng-template>
    `
})
export class StrictPublisherTemplateComponent {
    /** Item-emitting Publisher used by the default append mode. */
    readonly users = Flux.just<TemplateUser>({id: 1, name: "Ada"});
    /** Array-emitting Publisher used by explicit authoritative snapshot mode. */
    readonly snapshots = Flux.just<readonly TemplateUser[]>([{id: 1, name: "Ada"}]);
}
